// lib/services/azureStorage.ts


import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
}

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

/**
 * Sleep utility for delays
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Custom error type with status property
interface HttpError extends Error {
  status?: number;
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error as HttpError;
      lastError = err;
      
      // Check if it's a rate limit error
      const isRateLimitError = 
        err.message?.includes('Too Many Requests') ||
        err.message?.includes('429') ||
        err.status === 429;
      
      // If not a rate limit error and not the last attempt, rethrow
      if (!isRateLimitError && attempt === maxRetries - 1) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;
      
      console.log(
        `Attempt ${attempt + 1}/${maxRetries} failed. ` +
        `Retrying in ${Math.round(totalDelay)}ms... ` +
        `Error: ${err.message}`
      );
      
      await sleep(totalDelay);
    }
  }
  
  throw lastError!;
}

/**
 * Validate that downloaded content is actually binary file data, not JSON/text
 */
function validateFileContent(buffer: Buffer, contentType: string, fileName: string): void {
  // Check if buffer is suspiciously small (might be error message)
  if (buffer.length < 100 && !contentType.includes('image')) {
    console.warn(`⚠️  Suspiciously small file: ${fileName} (${buffer.length} bytes)`);
  }

  // Check if content looks like JSON (starts with { or [)
  const firstBytes = buffer.slice(0, 10).toString('utf8', 0, Math.min(10, buffer.length));
  if (firstBytes.trim().startsWith('{') || firstBytes.trim().startsWith('[')) {
    console.error(`❌ ERROR: Downloaded JSON instead of file for ${fileName}`);
    console.error(`First bytes: ${firstBytes}`);
    throw new Error(`Downloaded JSON/text instead of binary file for ${fileName}. Check RingCentral attachment URI.`);
  }

  // Validate content type matches expected file signature
  const fileSignatures: { [key: string]: number[][] } = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
    'image/gif': [[0x47, 0x49, 0x46, 0x38]], // GIF8
  };

  const signature = fileSignatures[contentType];
  if (signature) {
    const matches = signature.some(sig => {
      return sig.every((byte, i) => buffer[i] === byte);
    });
    
    if (!matches) {
      console.warn(`⚠️  Content type mismatch for ${fileName}. Expected ${contentType} but signature doesn't match.`);
    } else {
      console.log(`✓ File signature validated for ${fileName} (${contentType})`);
    }
  }
}

export class AzureStorageService {
  private containerName = 'share-file';
  private smsFolder = 'sms-uploads';

  private async getContainerClient(): Promise<ContainerClient> {
    const containerClient = blobServiceClient.getContainerClient(this.containerName);
    
    await containerClient.createIfNotExists({
      access: 'blob'
    });
    
    return containerClient;
  }

  /**
   * Upload a file to Azure Blob Storage
   */
  async uploadAttachment(
    buffer: Buffer,
    fileName: string,
    contentType: string
  ): Promise<string> {
    try {
      const containerClient = await this.getContainerClient();
      
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const blobName = `${this.smsFolder}/${timestamp}_${sanitizedFileName}`;
      
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      // Upload with proper content disposition for inline viewing
      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: contentType,
          blobContentDisposition: contentType.startsWith('image/') 
            ? 'inline' // Images display in browser
            : 'attachment' // PDFs/docs download or open in new tab
        }
      });
      
      console.log(`✅ Uploaded to Azure: ${blobName} (${buffer.length} bytes, ${contentType})`);
      
      return blockBlobClient.url;
    } catch (error) {
      console.error('Error uploading to Azure:', error);
      throw error;
    }
  }

  /**
   * Download a file from RingCentral and upload to Azure
   * WITH VALIDATION AND DEBUGGING
   */
  async downloadAndUpload(
    sourceUrl: string,
    fileName: string,
    contentType: string,
    authToken: string
  ): Promise<string> {
    return retryWithBackoff(async () => {
      try {
        console.log(`📥 Downloading from RingCentral: ${fileName}`);
        console.log(`   URL: ${sourceUrl}`);
        console.log(`   Expected type: ${contentType}`);
        
        // Download from RingCentral
        const response = await fetch(sourceUrl, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            // Explicitly request binary content
            'Accept': contentType || 'application/octet-stream'
          }
        });
        
        if (!response.ok) {
          const errorMessage = `Failed to download attachment: ${response.status} ${response.statusText}`;
          const error: HttpError = new Error(errorMessage);
          error.status = response.status;
          throw error;
        }

        // Log response details
        const actualContentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        console.log(`   Response type: ${actualContentType}`);
        console.log(`   Content length: ${contentLength} bytes`);

        // Check if we got JSON/text instead of binary
        if (actualContentType?.includes('application/json') || actualContentType?.includes('text/')) {
          const text = await response.text();
          console.error(`❌ ERROR: Received ${actualContentType} instead of file`);
          console.error(`   Content preview: ${text.substring(0, 200)}`);
          throw new Error(
            `RingCentral returned ${actualContentType} instead of file content. ` +
            `This attachment URI may not be a direct file download link. ` +
            `Content: ${text.substring(0, 100)}`
          );
        }
        
        // Convert to buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        console.log(`   Downloaded: ${buffer.length} bytes`);
        
        // Validate content is actually a file, not JSON/text
        validateFileContent(buffer, contentType, fileName);
        
        // Upload to Azure
        console.log(`📤 Uploading to Azure...`);
        const azureUrl = await this.uploadAttachment(buffer, fileName, contentType);
        
        return azureUrl;
      } catch (error: unknown) {
        const err = error as { message?: string };
        console.error(`❌ Error in downloadAndUpload for ${fileName}:`, err.message);
        throw error;
      }
    }, 5, 2000);
  }

  /**
   * Delete a file from Azure Blob Storage
   */
  async deleteAttachment(blobUrl: string): Promise<void> {
    try {
      const containerClient = await this.getContainerClient();
      
      const url = new URL(blobUrl);
      const blobName = url.pathname.split('/').slice(2).join('/');
      
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
      
      console.log(`Deleted attachment: ${blobName}`);
    } catch (error) {
      console.error('Error deleting from Azure:', error);
      throw error;
    }
  }

  /**
   * Check if a blob exists
   */
  async exists(blobUrl: string): Promise<boolean> {
    try {
      const containerClient = await this.getContainerClient();
      
      const url = new URL(blobUrl);
      const blobName = url.pathname.split('/').slice(2).join('/');
      
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      return await blockBlobClient.exists();
    } catch (error) {
      console.error('Error checking blob existence:', error);
      return false;
    }
  }
}

export const azureStorage = new AzureStorageService();