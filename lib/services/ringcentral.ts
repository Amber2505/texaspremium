import { RingCentralMessage } from '@/lib/models/message';

const RINGCENTRAL_SERVER = 'https://platform.ringcentral.com';
const CLIENT_ID = process.env.RINGCENTRAL_CLIENT_ID!;
const CLIENT_SECRET = process.env.RINGCENTRAL_CLIENT_SECRET!;
const JWT_TOKEN = process.env.RINGCENTRAL_JWT!;

/**
 * Sleep utility
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class RingCentralService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private requestCount: number = 0;
  private requestWindowStart: number = Date.now();
  private readonly RATE_LIMIT = 50; // Max requests per minute
  private readonly RATE_WINDOW = 60000; // 1 minute in milliseconds

  /**
   * Check and enforce rate limits
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowElapsed = now - this.requestWindowStart;

    // Reset window if it's been more than 1 minute
    if (windowElapsed >= this.RATE_WINDOW) {
      this.requestCount = 0;
      this.requestWindowStart = now;
      return;
    }

    // If we've hit the rate limit, wait until the window resets
    if (this.requestCount >= this.RATE_LIMIT) {
      const waitTime = this.RATE_WINDOW - windowElapsed;
      console.log(`Rate limit reached. Waiting ${Math.round(waitTime / 1000)}s...`);
      await sleep(waitTime);
      this.requestCount = 0;
      this.requestWindowStart = Date.now();
    }

    this.requestCount++;
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      await this.checkRateLimit();

      const response = await fetch(`${RINGCENTRAL_SERVER}/restapi/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: JWT_TOKEN
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get access token: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      
      if (!this.accessToken) {
        throw new Error('Access token not found in response');
      }
      
      // Set expiry to 5 minutes before actual expiry for safety
      this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw error;
    }
  }

  async getAllMessages(daysBack: number = 7): Promise<RingCentralMessage[]> {
    const accessToken = await this.getAccessToken();
    const allMessages: RingCentralMessage[] = [];
    
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - daysBack);
    const dateFromISO = dateFrom.toISOString();
    
    let page = 1;
    const perPage = 100;
    let hasMore = true;
    
    while (hasMore) {
      try {
        console.log(`Fetching page ${page}...`);
        
        // Check rate limit before making request
        await this.checkRateLimit();
        
        const url = new URL(`${RINGCENTRAL_SERVER}/restapi/v1.0/account/~/extension/~/message-store`);
        url.searchParams.append('messageType', 'SMS');
        url.searchParams.append('dateFrom', dateFromISO);
        url.searchParams.append('page', page.toString());
        url.searchParams.append('perPage', perPage.toString());
        
        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (!response.ok) {
          if (response.status === 429) {
            console.log('Rate limit hit, waiting 60 seconds...');
            await sleep(60000);
            continue; // Retry the same page
          }
          
          const errorText = await response.text();
          throw new Error(`Failed to fetch messages: ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (data.records && data.records.length > 0) {
          allMessages.push(...data.records);
          console.log(`Fetched ${data.records.length} messages from page ${page}`);
          
          // Check if there are more pages
          if (data.paging && data.paging.page < data.paging.totalPages) {
            page++;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
        
        // Add a delay between pages to be nice to the API
        if (hasMore) {
          await sleep(500); // 500ms delay between pages
        }
        
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        hasMore = false;
      }
    }
    
    console.log(`Total messages fetched: ${allMessages.length}`);
    return allMessages;
  }

  async getMessageById(messageId: string): Promise<RingCentralMessage | null> {
    const accessToken = await this.getAccessToken();
    
    try {
      await this.checkRateLimit();
      
      const response = await fetch(
        `${RINGCENTRAL_SERVER}/restapi/v1.0/account/~/extension/~/message-store/${messageId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (!response.ok) {
        if (response.status === 429) {
          console.log('Rate limit hit, waiting 60 seconds...');
          await sleep(60000);
          return this.getMessageById(messageId); // Retry
        }
        throw new Error(`Failed to fetch message: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching message:', error);
      return null;
    }
  }

  async downloadAttachment(attachmentUri: string): Promise<Buffer> {
    const accessToken = await this.getAccessToken();
    
    try {
      await this.checkRateLimit();
      
      const response = await fetch(attachmentUri, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          console.log('Rate limit hit while downloading attachment, waiting 60 seconds...');
          await sleep(60000);
          return this.downloadAttachment(attachmentUri); // Retry
        }
        throw new Error(`Failed to download attachment: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      throw error;
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): { remaining: number; resetIn: number } {
    const now = Date.now();
    const windowElapsed = now - this.requestWindowStart;
    const remaining = Math.max(0, this.RATE_LIMIT - this.requestCount);
    const resetIn = Math.max(0, this.RATE_WINDOW - windowElapsed);
    
    return { remaining, resetIn };
  }
}

export const ringCentralService = new RingCentralService();