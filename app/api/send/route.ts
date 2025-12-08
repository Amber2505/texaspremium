import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";
import { azureStorage } from "@/lib/services/azureStorage";
import { SDK } from "@ringcentral/sdk";
import FormData from 'form-data';

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";
const MY_PHONE = process.env.RINGCENTRAL_PHONE_NUMBER || "";

// Helper function to create conversation ID from participants
function createConversationId(participants: string[]): string {
  // Filter out our own number and remove duplicates
  const uniqueParticipants = Array.from(new Set(
    participants.filter(p => p && p !== MY_PHONE)
  ));
  
  // Sort alphabetically for consistency
  return uniqueParticipants.sort().join(',');
}

async function getRingCentralClient() {
  const rcsdk = new SDK({
    server: RINGCENTRAL_SERVER,
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
  });

  const platform = rcsdk.platform();
  await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
  return platform;
}

// Type for RingCentral message body
interface RingCentralMessageBody {
  from: { phoneNumber: string | undefined };
  to: { phoneNumber: string }[];
  text?: string;
}

// Type for RingCentral API response
interface RingCentralResponse {
  id: string;
  creationTime: string;
  lastModifiedTime: string;
}

// Type for RingCentral error
interface RingCentralError {
  message?: string;
  response?: {
    status?: number;
    json: () => Promise<{
      message?: string;
      errorCode?: string;
      error_description?: string;
    }>;
  };
  status?: number;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    
    let phoneNumbers: string[] = []; // Now supports multiple recipients
    let message = "";
    const files: File[] = [];
    
    console.log('📨 Received request, content-type:', contentType);
    
    // Handle FormData (with or without files)
    if (contentType?.includes('multipart/form-data')) {
      const formData = await request.formData();
      
      // Log all form data entries for debugging
      console.log('📋 FormData entries:');
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          console.log(`  ${key}: [File] ${value.name} (${value.type})`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      }
      
      // Support both single 'to' and array 'to[]'
      const toField = formData.get('to') as string | null;
      const toArray = formData.getAll('to[]') as string[];
      
      if (toArray && toArray.length > 0) {
        phoneNumbers = toArray;
      } else if (toField) {
        // Check if it's a comma-separated list (for group conversations)
        phoneNumbers = toField.includes(',') ? toField.split(',').map(p => p.trim()) : [toField];
      }
      
      message = (formData.get('message') || '') as string;
      
      // Collect all uploaded files - look for 'files' field specifically
      const fileEntries = formData.getAll('files');
      for (const entry of fileEntries) {
        if (entry instanceof File) {
          files.push(entry);
        }
      }
      
      console.log(`📞 Extracted - Phones: [${phoneNumbers.join(', ')}], Message: "${message}", Files: ${files.length}`);
    }
    // Handle JSON (text only)
    else if (contentType?.includes('application/json')) {
      const body = await request.json();
      
      // Support both single 'to' and array 'to'
      if (Array.isArray(body.to)) {
        phoneNumbers = body.to;
      } else if (typeof body.to === 'string') {
        // Check if it's a comma-separated list
        phoneNumbers = body.to.includes(',') ? body.to.split(',').map((p: string) => p.trim()) : [body.to];
      } else if (body.phoneNumber) {
        phoneNumbers = [body.phoneNumber];
      }
      
      message = body.message || "";
    }
    else {
      return NextResponse.json(
        { error: 'Content-Type must be application/json or multipart/form-data' },
        { status: 400 }
      );
    }
    
    // Early validation
    if (!phoneNumbers || phoneNumbers.length === 0) {
      console.error('❌ Phone number is missing or empty');
      return NextResponse.json(
        { error: 'At least one phone number is required' },
        { status: 400 }
      );
    }
    
    if (!message?.trim() && files.length === 0) {
      return NextResponse.json(
        { error: 'Phone number and message/file are required' },
        { status: 400 }
      );
    }

    console.log(`📞 Received request - Phones: [${phoneNumbers.join(', ')}], Message: ${message?.substring(0, 50)}, Files: ${files.length}`);

    // Validate and format all phone numbers
    const formattedPhones: string[] = [];
    for (const phoneNumber of phoneNumbers) {
      const cleaned = phoneNumber.replace(/\D/g, "");
      if (cleaned.length < 10) {
        return NextResponse.json(
          { error: `Invalid phone number - must be at least 10 digits: ${phoneNumber}` },
          { status: 400 }
        );
      }

      // Format phone number for RingCentral (must include +1)
      const formattedPhone = cleaned.startsWith("1")
        ? `+${cleaned}`
        : `+1${cleaned}`;
      
      // Validate final format
      if (!formattedPhone.match(/^\+1\d{10}$/)) {
        return NextResponse.json(
          { error: `Invalid phone number format: ${formattedPhone}` },
          { status: 400 }
        );
      }
      
      formattedPhones.push(formattedPhone);
    }

    console.log(`📤 Formatted phones: [${formattedPhones.join(', ')}]`);
    
    const isGroup = formattedPhones.length > 1;
    console.log(`📊 Group message: ${isGroup ? 'YES' : 'NO'} (${formattedPhones.length} recipients)`);

    // Prepare attachments for RingCentral
    const platform = await getRingCentralClient();
    const formData = new FormData();
    
    // Add request metadata - object format (RingCentral SDK standard)
    const body: RingCentralMessageBody = {
      from: { phoneNumber: process.env.RINGCENTRAL_PHONE_NUMBER },
      to: formattedPhones.map(phone => ({ phoneNumber: phone })),
    };
    
    if (message && message.trim()) {
      body.text = message.trim();
    }
    
    console.log(`📋 RingCentral body (object format):`, JSON.stringify(body, null, 2));
    
    // Create Buffer from JSON string
    const jsonBuffer = Buffer.from(JSON.stringify(body), 'utf8');
    formData.append('json', jsonBuffer, {
      filename: 'request.json',
      contentType: 'application/json'
    });
    
    console.log(`📦 FormData metadata:`);
    console.log(`  Field: json (as Buffer with contentType)`);
    console.log(`  Value: ${JSON.stringify(body)}`);

    // Upload files to Azure first and add to RingCentral request
    const uploadedAttachments: Array<{
      id: string;
      uri: string;
      type: string;
      contentType: string;
      azureUrl: string;
      filename: string;
    }> = [];
    
    for (const file of files) {
      try {
        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Upload to Azure using existing service
        const azureUrl = await azureStorage.uploadAttachment(buffer, file.name, file.type);
        
        console.log(`📦 Adding attachment to FormData:`);
        console.log(`  File: ${file.name}`);
        console.log(`  Type: ${file.type}`);
        console.log(`  Size: ${buffer.length} bytes`);
        
        // Add attachment to FormData
        formData.append('attachment', buffer, {
          filename: file.name,
          contentType: file.type
        });
        
        uploadedAttachments.push({
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          uri: azureUrl,
          type: file.type,
          contentType: file.type,
          azureUrl: azureUrl,
          filename: file.name,
        });
        
        console.log(`📎 Uploaded attachment: ${file.name} to Azure`);
      } catch (error) {
        console.error(`❌ Failed to upload ${file.name}:`, error);
      }
    }

    // Send via RingCentral
    console.log(`🚀 Sending to RingCentral with ${uploadedAttachments.length} attachments...`);
    console.log(`📡 FormData headers:`, formData.getHeaders());
    
    let result: RingCentralResponse;
    try {
      // Try using /mms endpoint for PDF support
      const endpoint = '/restapi/v1.0/account/~/extension/~/sms';
      console.log(`🎯 Using endpoint: ${endpoint}`);
      
      // Send FormData - SDK will handle headers automatically
      const response = await platform.post(endpoint, formData);
      result = await response.json() as RingCentralResponse;
      
      console.log("✅ Message sent successfully:", result.id);
    } catch (rcError: unknown) {
      const err = rcError as RingCentralError;
      console.error("❌ RingCentral API error:", rcError);
      console.error("Error details:", {
        message: err.message,
        response: err.response,
        status: err.status
      });
      
      // Try to get detailed error message
      let errorMessage = "Failed to send via RingCentral";
      
      // Check for 413 error (file too large)
      if (err.response?.status === 413 || err.message?.includes("413")) {
        errorMessage = "File is too large. MMS limit is 1.5MB. Please compress the file or choose a smaller one.";
      } else if (err.response) {
        try {
          const errorData = await err.response.json();
          console.error("RC Error response body:", errorData);
          errorMessage = errorData.message || errorData.errorCode || errorData.error_description || errorMessage;
        } catch {
          console.error("Could not parse error response");
          errorMessage = err.message || errorMessage;
        }
      } else {
        errorMessage = err.message || errorMessage;
      }
      
      console.error("Final error message:", errorMessage);
      throw new Error(errorMessage);
    }

    // Save to MongoDB conversation
    const client = await connectToDatabase;
    const db = client.db("db");
    const conversationsCollection = db.collection("texas_premium_messages");

    // Create conversation ID from all participants
    const conversationId = createConversationId(formattedPhones);

    const messageObj = {
      id: result.id.toString(),
      direction: "Outbound",
      type: files.length > 0 ? "MMS" : "SMS",
      subject: message || (files.length > 0 ? `Sent ${files.length} attachment(s)` : ""),
      creationTime: new Date(result.creationTime).toISOString(),
      lastModifiedTime: new Date(result.lastModifiedTime).toISOString(),
      readStatus: "Read",
      messageStatus: "Sent",
      from: {
        phoneNumber: process.env.RINGCENTRAL_PHONE_NUMBER!,
      },
      to: formattedPhones.map(phone => ({ phoneNumber: phone })),
      attachments: uploadedAttachments,
    };

    // Add message to conversation
    await conversationsCollection.updateOne(
      { conversationId: conversationId },
      {
        $push: { 
          messages: {
            $each: [messageObj],
            $sort: { creationTime: 1 }
          }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        $set: {
          lastMessageTime: messageObj.creationTime,
          lastMessageId: result.id.toString(),
        },
        $setOnInsert: {
          conversationId: conversationId,
          phoneNumber: formattedPhones[0], // For backward compatibility (primary recipient)
          participants: conversationId.split(','), // Array of all participants
          isGroup: isGroup,
        },
      },
      { upsert: true }
    );

    console.log(`💾 Message saved to conversation ${conversationId} (group: ${isGroup})`);

    return NextResponse.json({
      success: true,
      message: "Message sent successfully",
      messageId: result.id,
      attachments: uploadedAttachments.length,
      conversationId: conversationId,
      isGroup: isGroup,
      recipients: formattedPhones.length,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('❌ Send message error:', error);
    return NextResponse.json(
      { error: err.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}