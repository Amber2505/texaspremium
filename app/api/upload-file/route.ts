// api/upload-file
import { NextResponse } from 'next/server';
import { BlobServiceClient } from '@azure/storage-blob';

const AZURE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME!;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
   
    if (!file) {
      return NextResponse.json({ 
        success: false, 
        error: 'No file provided' 
      }, { status: 400 });
    }

    // Validate file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        success: false, 
        error: 'File size exceeds 10MB limit' 
      }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        success: false, 
        error: 'File type not supported. Allowed: images, PDF, DOC, DOCX' 
      }, { status: 400 });
    }
   
    // Create Azure Blob Service Client
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    // Ensure container exists
    await containerClient.createIfNotExists({
      access: 'blob' // Public read access for blobs
    });
   
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const blobName = `chat-uploads/${timestamp}-${sanitizedFilename}`;
   
    // Get blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
   
    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
   
    // Upload to Azure Blob Storage with content type
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: file.type
      }
    });
   
    // Get the public URL
    const fileUrl = blockBlobClient.url;
   
    console.log('✅ File uploaded successfully:', {
      fileName: file.name,
      blobName,
      fileUrl,
      size: file.size,
      type: file.type
    });

    return NextResponse.json({
      success: true,
      fileUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });

  } catch (error) {
    console.error('❌ File upload error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json({
      success: false,
      error: 'Failed to upload file',
      details: errorMessage
    }, { status: 500 });
  }
}

// Optional: Add GET endpoint to list uploaded files
export async function GET() {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    const files = [];
    
    for await (const blob of containerClient.listBlobsFlat({ prefix: 'chat-uploads/' })) {
      files.push({
        name: blob.name,
        url: `${containerClient.url}/${blob.name}`,
        size: blob.properties.contentLength,
        lastModified: blob.properties.lastModified
      });
    }

    return NextResponse.json({
      success: true,
      files,
      count: files.length
    });

  } catch (error) {
    console.error('❌ Error listing files:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to list files'
    }, { status: 500 });
  }
}