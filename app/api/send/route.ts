import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from "@/lib/mongodb";
import { azureStorage } from "@/lib/services/azureStorage";
import { SDK } from "@ringcentral/sdk";
import FormData from 'form-data';

const RINGCENTRAL_SERVER = "https://platform.ringcentral.com";

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

// Type for RingCentral error
interface RingCentralError {
  message?: string;
  response?: Response & { status?: number };
  status?: number;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    
    let phoneNumber: string;
    let message: string;
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
      
      phoneNumber = (formData.get('to') || formData.get('phoneNumber') || '') as string;
      message = (formData.get('message') || '') as string;
      
      // Collect all uploaded files - look for 'files' field specifically
      const fileEntries = formData.getAll('files');
      for (const entry of fileEntries) {
        if (entry instanceof File) {
          files.push(entry);
        }
      }
      
      console.log(`📞 Extracted - Phone: "${phoneNumber}", Message: "${message}", Files: ${files.length}`);
    }
    // Handle JSON (text only)
    else if (contentType?.includes('application/json')) {
      const body = await request.json();
      phoneNumber = body.to || body.phoneNumber;
      message = body.message;
    }
    else {
      return NextResponse.json(
        { error: 'Content-Type must be application/json or multipart/form-data' },
        { status: 400 }
      );
    }
    
    // Early validation
    if (!phoneNumber || phoneNumber.trim() === '') {
      console.error('❌ Phone number is missing or empty');
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }
    
    if (!message?.trim() && files.length === 0) {
      return NextResponse.json(
        { error: 'Phone number and message/file are required' },
        { status: 400 }
      );
    }

    console.log(`📞 Received request - Phone: ${phoneNumber}, Message: ${message?.substring(0, 50)}, Files: ${files.length}`);

    // Validate phone number format
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (cleaned.length < 10) {
      return NextResponse.json(
        { error: "Invalid phone number - must be at least 10 digits" },
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

    console.log(`📤 Formatted phone: ${formattedPhone}`);

    // Prepare attachments for RingCentral
    const platform = await getRingCentralClient();
    const formData = new FormData();
    
    // Add request metadata - object format (RingCentral SDK standard)
    const body: RingCentralMessageBody = {
      from: { phoneNumber: process.env.RINGCENTRAL_PHONE_NUMBER },
      to: [{ phoneNumber: formattedPhone }],
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
    const uploadedAttachments = [];
    
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
    
    let result: { id: string; creationTime: string; lastModifiedTime: string };
    try {
      // Try using /mms endpoint for PDF support
      const endpoint = '/restapi/v1.0/account/~/extension/~/sms';
      console.log(`🎯 Using endpoint: ${endpoint}`);
      
      // Send FormData - SDK will handle headers automatically
      const response = await platform.post(endpoint, formData);
      result = await response.json();
      
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

    const messageObj = {
      id: result.id.toString(),
      direction: "Outbound",
      type: "SMS",
      subject: message || (files.length > 0 ? `Sent ${files.length} attachment(s)` : ""),
      creationTime: new Date(result.creationTime).toISOString(),
      lastModifiedTime: new Date(result.lastModifiedTime).toISOString(),
      readStatus: "Read",
      messageStatus: "Sent",
      from: {
        phoneNumber: process.env.RINGCENTRAL_PHONE_NUMBER!,
      },
      to: [
        {
          phoneNumber: formattedPhone,
        },
      ],
      attachments: uploadedAttachments,
    };

    // Add message to conversation
    await conversationsCollection.updateOne(
      { phoneNumber: formattedPhone },
      {
        $push: { 
          messages: {
            $each: [messageObj],
            $sort: { creationTime: 1 }
          }
        },
        $set: {
          lastMessageTime: messageObj.creationTime,
          lastMessageId: result.id.toString(),
        },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { upsert: true }
    );

    console.log("💾 Message with attachments saved to conversation");

    return NextResponse.json({
      success: true,
      message: "Message sent successfully",
      messageId: result.id,
      attachments: uploadedAttachments.length,
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