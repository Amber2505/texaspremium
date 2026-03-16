const { createServer } = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const express = require('express');
const { BlobServiceClient } = require('@azure/storage-blob');

const app = express();
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://www.texaspremiumins.com",
      "https://texaspremium-git-main-amber2505s-projects.vercel.app",
      "https://texaspremium-elczh28e2-amber2505s-projects.vercel.app",
      "https://texaspremium-production.up.railway.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 120000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// ================================================
// CONSTANTS
// ================================================
const MY_PHONE_NUMBER = process.env.MY_PHONE_NUMBER || '+14697295185';
const RINGCENTRAL_SERVER = 'https://platform.ringcentral.com';
let scheduleCollection;

// ================================================
// HELPER: Normalize phone number
// ================================================
function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

// ================================================
// HELPER: Determine if message is group and build conversationId
// ================================================
function getConversationInfo(msg) {
  const myPhone = normalizePhone(MY_PHONE_NUMBER);
  const fromPhone = normalizePhone(msg.from?.phoneNumber || '');
  const toPhones = (msg.to || []).map(t => normalizePhone(t.phoneNumber || '')).filter(Boolean);
  
  const otherRecipients = toPhones.filter(p => p !== myPhone);
  
  const participants = new Set();
  
  if (msg.direction === 'Inbound') {
    participants.add(fromPhone);
    otherRecipients.forEach(p => participants.add(p));
  } else {
    otherRecipients.forEach(p => participants.add(p));
  }
  
  const participantsArray = Array.from(participants).filter(Boolean).sort();
  const isGroup = participantsArray.length > 1;
  const conversationId = participantsArray.join(',');
  const primaryPhone = msg.direction === 'Inbound' ? fromPhone : participantsArray[0] || '';
  
  return {
    conversationId,
    participants: participantsArray,
    isGroup,
    primaryPhone,
  };
}

// ================================================
// AZURE STORAGE HELPER
// ================================================
async function uploadToAzure(buffer, filename, contentType) {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      console.error('❌ AZURE_STORAGE_CONNECTION_STRING not set');
      return null;
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient('share-file');
    
    const blobName = `sms-uploads/${Date.now()}_${filename}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType }
    });
    
    console.log(`✅ Uploaded to Azure: ${blobName} (${buffer.length} bytes)`);
    return blockBlobClient.url;
  } catch (error) {
    console.error('❌ Azure upload error:', error.message);
    return null;
  }
}

async function downloadAndUploadAttachment(uri, filename, contentType, authToken) {
  try {
    console.log(`   📥 Downloading: ${filename}`);
    
    const response = await fetch(uri, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.status === 429) {
      console.error(`   🚫 Rate limited on attachment download`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`   ❌ Download failed: ${response.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`   📦 Downloaded ${buffer.length} bytes`);
    
    const azureUrl = await uploadToAzure(buffer, filename, contentType);
    return azureUrl;
  } catch (error) {
    console.error(`   ❌ Download/upload error:`, error.message);
    return null;
  }
}

// ================================================
// REAL-TIME RINGCENTRAL NOTIFICATION ENDPOINT
// ================================================
app.post('/notify/ringcentral', (req, res) => {
  try {
    const { phoneNumber, conversationId, messageId, timestamp, subject, isGroup } = req.body;

    const roomId = conversationId || phoneNumber;
    if (!roomId) {
      console.warn('Missing phoneNumber/conversationId in /notify/ringcentral');
      return res.status(400).json({ error: "Missing identifier" });
    }

    console.log(`📡 Broadcasting to conversation:${roomId} (group: ${isGroup})`);

    io.to(`conversation:${roomId}`).emit('newRingCentralMessage', {
      conversationId: roomId,
      phoneNumber,
      messageId,
      timestamp,
      subject: subject || "New message",
      isGroup,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error in /notify/ringcentral:', error);
    res.status(500).json({ error: "Internal error" });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    lastSync: lastSyncTime,
    nextSync: nextSyncTime
  });
});

// Manual sync trigger endpoint
app.post('/trigger-sync', async (req, res) => {
  try {
    console.log('📱 Manual sync triggered via HTTP');
    const result = await syncRingCentralMessages();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ================================================
// MONGODB CONNECTION
// ================================================
let db;
let liveChatHistoryCollection;
let deletedChatsCollection;
let mongoClient = null;
let messagesDb;
let conversationsCollection;

async function connectMongoDB() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("Missing MONGODB_URI environment variable");
    }

    console.log('Attempting to connect to MongoDB...');
    
    mongoClient = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
    });
    
    await mongoClient.connect();
    await mongoClient.db().admin().ping();
    console.log('MongoDB ping successful');
    
    db = mongoClient.db('myFirstDatabase');
    liveChatHistoryCollection = db.collection('live_chat_history');
    deletedChatsCollection = db.collection('deleted_chats_history');
    
    messagesDb = mongoClient.db('db');
    conversationsCollection = messagesDb.collection('texas_premium_messages');
    scheduleCollection = messagesDb.collection('schedule_message_storage');
    await scheduleCollection.createIndex({ status: 1, scheduledAt: 1 }).catch(() => {});
    console.log('✅ Schedule collection connected');
    
    // Create index for faster message lookups
    await conversationsCollection.createIndex({ 'messages.id': 1 }).catch(() => {});
    await conversationsCollection.createIndex({ conversationId: 1 }).catch(() => {});
    await conversationsCollection.createIndex({ phoneNumber: 1 }).catch(() => {});
    
    const count = await liveChatHistoryCollection.countDocuments();
    console.log(`MongoDB connected successfully. Found ${count} existing chat records.`);
    
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.error('Stack:', error.stack);
    db = null;
    liveChatHistoryCollection = null;
    deletedChatsCollection = null;
    messagesDb = null;
    conversationsCollection = null;
    return false;
  }
}

// ================================================
// PAYMENT LINK AUTO-DISABLE SYSTEM
// Disables all payment links created TODAY at 10 PM CST
// ================================================

let paymentLinksDb;
let paymentLinksCollection;
let lastDisableDate = null; // Track last disable date to prevent duplicate runs

async function connectPaymentLinksDB() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI not found for payment links');
      return false;
    }
    paymentLinksDb = mongoClient.db('db');
    paymentLinksCollection = paymentLinksDb.collection('payment_link_generated');
    console.log('✅ Payment links database connected');
    return true;
  } catch (error) {
    console.error('❌ Payment links DB connection error:', error.message);
    return false;
  }
}

async function disableTodaysPaymentLinks() {
  try {
    if (!paymentLinksCollection) {
      return { success: false, error: 'Database not connected' };
    }

    const now = new Date();
    const cstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    
    const startOfToday = new Date(cstTime);
    startOfToday.setHours(0, 0, 0, 0);
    
    const endOfToday = new Date(cstTime);
    endOfToday.setHours(23, 59, 59, 999);

    console.log(`🔍 Searching for payment links created today (CST)`);
    console.log(`   Today's date range: ${startOfToday.toISOString()} to ${endOfToday.toISOString()}`);

    const query = {
      linkType: 'payment',
      disabled: { $ne: true },
    };

    const linksToDisable = await paymentLinksCollection.find(query).toArray();

    if (linksToDisable.length === 0) {
      console.log('ℹ️  No payment links created today to disable');
      return { success: true, disabled: 0, message: 'No links to disable' };
    }

    const result = await paymentLinksCollection.updateMany(
      query,
      {
        $set: {
          disabled: true,
          disabledAt: new Date().toISOString(),
          disabledReason: 'Auto-disabled at 10 PM CST',
          autoDisabled: true
        }
      }
    );

    console.log(`✅ Disabled ${result.modifiedCount} payment links created today`);
    
    linksToDisable.forEach(link => {
      console.log(`   📌 Disabled: ${link.generatedLink}`);
    });

    return {
      success: true,
      disabled: result.modifiedCount,
      date: cstTime.toLocaleDateString(),
      time: cstTime.toLocaleTimeString()
    };

  } catch (error) {
    console.error('❌ Error disabling payment links:', error.message);
    return { success: false, error: error.message };
  }
}

function scheduleDailyDisable() {
  // ✅ IMPROVED: Check every 30 seconds (instead of 60) for better accuracy
  setInterval(async () => {
    const now = new Date();
    const cstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    
    const hour = cstTime.getHours();
    const minute = cstTime.getMinutes();
    const todayDate = cstTime.toDateString(); // e.g., "Mon Feb 02 2026"
    
    // ✅ IMPROVED: Run between 10:00 PM and 10:05 PM (5-minute window)
    // ✅ IMPROVED: Only run once per day using lastDisableDate flag
    if (hour === 22 && minute >= 0 && minute < 5 && lastDisableDate !== todayDate) {
      console.log('🕙 10 PM CST window detected - Running payment link auto-disable...');
      console.log(`   Current CST time: ${cstTime.toLocaleTimeString()}`);
      
      const result = await disableTodaysPaymentLinks();
      
      if (result.success) {
        console.log(`✅ Auto-disable complete: ${result.disabled} links disabled`);
        lastDisableDate = todayDate; // ✅ Mark today as completed
        console.log(`   Next auto-disable: Tomorrow at 10:00 PM CST`);
      } else {
        console.error(`❌ Auto-disable failed: ${result.error}`);
        // Don't set lastDisableDate so it can retry in the next interval
      }
    }
    
    // ✅ Reset the flag at midnight to allow next day's disable
    if (hour === 0 && minute === 0 && lastDisableDate !== null) {
      console.log('🌙 Midnight detected - Resetting auto-disable flag for new day');
      lastDisableDate = null;
    }
  }, 30000); // ✅ Check every 30 seconds instead of 60
  
  console.log('⏰ Payment link auto-disable scheduled for 10:00-10:05 PM CST daily');
  console.log('   (Checking every 30 seconds for accuracy)');
}

// ================================================
// DAILY AUTOPAY SECURITY CODE SYSTEM
// Generates new 4-digit code daily at 7 AM CST
// ================================================

let securityCodeCollection;
let lastCodeDate = null;

async function connectSecurityCodeDB() {
  try {
    securityCodeCollection = mongoClient.db('db').collection('texas_autopay_security');
    console.log('✅ Security code database connected');
    return true;
  } catch (error) {
    console.error('❌ Security code DB connection error:', error.message);
    return false;
  }
}

async function generateDailySecurityCode() {
  try {
    if (!securityCodeCollection) return;

    // Generate random 4-digit code (1000-9999)
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const now = new Date();
    const cstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const todayDate = cstTime.toDateString();

    // Save to MongoDB (upsert so there's always only one active code)
    await securityCodeCollection.updateOne(
      { type: 'daily_code' },
      {
        $set: {
          code: code,
          generatedAt: now.toISOString(),
          generatedDate: todayDate,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        }
      },
      { upsert: true }
    );

    console.log(`🔐 New daily security code generated for ${todayDate}`);

    // Send SMS to admin
    const message = encodeURIComponent(`Your autopay security code for today is: ${code}`);
    await fetch(`https://astraldbapi.herokuapp.com/message_send/?message=${message}&To=9727486404`);
    console.log('📱 Security code sent via SMS');

    return code;
  } catch (error) {
    console.error('❌ Error generating security code:', error.message);
  }
}

function scheduleDailySecurityCode() {
  setInterval(async () => {
    const now = new Date();
    const cstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const hour = cstTime.getHours();
    const minute = cstTime.getMinutes();
    const todayDate = cstTime.toDateString();

    // Run at 7:00-7:05 AM CST, once per day
    if (hour === 7 && minute >= 0 && minute < 5 && lastCodeDate !== todayDate) {
      console.log('🔐 7 AM CST - Generating new security code...');
      await generateDailySecurityCode();
      lastCodeDate = todayDate;
    }

    // Reset at midnight
    if (hour === 0 && minute === 0 && lastCodeDate !== null) {
      lastCodeDate = null;
    }
  }, 30000); // Check every 30 seconds

  console.log('⏰ Daily security code scheduled for 7:00 AM CST');
}



// ================================================
// RINGCENTRAL SYNC FUNCTION (WITH FIXED DUPLICATE PREVENTION)
// ================================================
let lastSyncTime = null;
let nextSyncTime = null;
let rateLimitedUntil = null;
let consecutiveErrors = 0;
let isSyncing = false;
let pendingSyncQueued = false;

async function getRingCentralPlatform() {
  const SDK = require('@ringcentral/sdk').SDK;
  
  const rcsdk = new SDK({
    server: process.env.RINGCENTRAL_SERVER || RINGCENTRAL_SERVER,
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
  });

  const platform = rcsdk.platform();
  await platform.login({ jwt: process.env.RINGCENTRAL_JWT });
  return platform;
}

async function syncRingCentralMessages() {
  // ✅ NEW: Emergency disable switch via environment variable
  if (process.env.SYNC_DISABLED === 'true') {
    console.log('⚠️ Sync disabled via SYNC_DISABLED environment variable');
    return { success: false, error: 'Sync disabled' };
  }

  if (isSyncing) {
    console.log('⏳ Sync already in progress, queuing follow-up...');
    pendingSyncQueued = true;
    return { success: false, error: 'Sync in progress, queued' };
  }
  
  isSyncing = true;
  const startTime = Date.now();

  if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
    const waitSeconds = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
    console.log(`⏳ Rate limited, waiting ${waitSeconds}s...`);
    isSyncing = false;
    return { success: false, error: 'Rate limited', waitSeconds };
  }

  if (!conversationsCollection) {
    isSyncing = false;
    return { success: false, error: 'Database not connected' };
  }

  const requiredVars = ['RINGCENTRAL_CLIENT_ID', 'RINGCENTRAL_CLIENT_SECRET', 'RINGCENTRAL_JWT'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    console.error(`❌ Missing RingCentral env vars: ${missingVars.join(', ')}`);
    isSyncing = false;
    return { success: false, error: `Missing env vars: ${missingVars.join(', ')}` };
  }

  try {
    const platform = await getRingCentralPlatform();
    const authData = await platform.auth().data();
    const authToken = authData.access_token;
    
    if (!authToken) {
      console.error('❌ No auth token available');
      isSyncing = false;
      return { success: false, error: 'No auth token' };
    }

    const dateFrom = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const response = await platform.get('/restapi/v1.0/account/~/extension/~/message-store', {
      messageType: 'SMS',
      dateFrom: dateFrom,
      perPage: 100,
    });

    const data = await response.json();
    const messages = data.records || [];

    let synced = 0;
    let skipped = 0;
    let attachmentsDownloaded = 0;
    let groupMessages = 0;
    let individualMessages = 0;
    let duplicatesPrevented = 0; // ✅ NEW: Track prevented duplicates
    let readStatusUpdated = 0; // ✅ NEW: Track read status updates

    for (const msg of messages) {
      const messageId = msg.id.toString();
      
      const convInfo = getConversationInfo(msg);
      const { conversationId, participants, isGroup, primaryPhone } = convInfo;
      
      if (!conversationId) {
        skipped++;
        continue;
      }

      // ════════════════════════════════════════════════════════════════
      // ✅ FIXED: Check if message exists in ANY conversation (by message ID)
      // This prevents duplicates AND handles moving messages to correct conversation
      // ════════════════════════════════════════════════════════════════
      const existingMsg = await conversationsCollection.findOne(
        { 'messages.id': messageId },
        { projection: { _id: 1, conversationId: 1, phoneNumber: 1, 'messages.$': 1 } }
      );

      if (existingMsg) {
        // Message already exists somewhere
        const existingMsgData = existingMsg.messages?.[0];
        const hasAzureUrls = existingMsgData?.attachments?.some(a => a.azureUrl);
        const rcHasAttachments = msg.attachments?.length > 0;
        
        // ✅ NEW: Check if read status changed
        const needsReadStatusUpdate = existingMsgData && 
                                      existingMsgData.readStatus !== msg.readStatus &&
                                      msg.direction === 'Inbound';
        
        if (needsReadStatusUpdate) {
          console.log(`   🔄 Updating read status for ${messageId}: ${existingMsgData.readStatus} → ${msg.readStatus}`);
          await conversationsCollection.updateOne(
            { 'messages.id': messageId },
            { $set: { 'messages.$.readStatus': msg.readStatus } }
          );
          readStatusUpdated++;
        }
        
        // Check if it's in the WRONG conversation (needs moving to group)
        const existingConvId = existingMsg.conversationId || existingMsg.phoneNumber;
        
        if (isGroup && existingConvId !== conversationId) {
          console.log(`   🔄 Moving message ${messageId} from ${existingConvId} to group ${conversationId}`);
          // Remove from wrong conversation
          await conversationsCollection.updateOne(
            { _id: existingMsg._id },
            { $pull: { messages: { id: messageId } } }
          );
          // Will be added to correct conversation below
        } else if (hasAzureUrls || !rcHasAttachments) {
          // Message exists in correct place with attachments handled
          duplicatesPrevented++; // ✅ Track that we prevented a duplicate
          skipped++;
          continue;
        }
        // Fall through to fix attachments or add to correct conversation
      }

      // For inbound messages, fetch full message details
      let fullMessage = msg;
      
      if (msg.direction === 'Inbound') {
        try {
          const fullMsgResponse = await fetch(
            `${RINGCENTRAL_SERVER}/restapi/v1.0/account/~/extension/~/message-store/${messageId}`,
            { headers: { 'Authorization': `Bearer ${authToken}` } }
          );
          
          if (fullMsgResponse.status === 429) {
            console.log('🚫 Rate limited on message fetch!');
            rateLimitedUntil = Date.now() + 60000;
            break;
          }
          
          if (fullMsgResponse.ok) {
            fullMessage = await fullMsgResponse.json();
          }
        } catch (e) {
          console.log(`⚠️ Could not fetch full message ${messageId}`);
        }
      }

      // Process attachments
      const processedAttachments = [];
      let extractedText = fullMessage.subject || '';
      
      if (fullMessage.attachments && fullMessage.attachments.length > 0) {
        for (const att of fullMessage.attachments) {
          if (!att.contentType) continue;
          
          // Extract text from text/plain attachments and merge into subject
          if (att.contentType.startsWith('text/') && att.uri) {
            try {
              const textResponse = await fetch(att.uri, {
                headers: { 'Authorization': `Bearer ${authToken}` }
              });
              if (textResponse.ok) {
                const textContent = await textResponse.text();
                if (textContent.trim()) {
                  extractedText = extractedText 
                    ? `${extractedText}\n${textContent.trim()}` 
                    : textContent.trim();
                }
              }
            } catch (e) {
              console.log(`⚠️ Could not fetch text attachment: ${e.message}`);
            }
            continue;
          }
          
          const isMedia = att.contentType.startsWith('image/') ||
                         att.contentType.startsWith('audio/') ||
                         att.contentType.startsWith('video/') ||
                         att.contentType === 'application/pdf';
          
          if (!isMedia || !att.uri) continue;

          try {
            const extension = att.contentType.split('/')[1] || 'bin';
            const filename = `${messageId}_${att.id}.${extension}`;
            
            const azureUrl = await downloadAndUploadAttachment(
              att.uri,
              filename,
              att.contentType,
              authToken
            );
            
            if (azureUrl) {
              processedAttachments.push({
                id: att.id?.toString(),
                uri: att.uri,
                type: att.type,
                contentType: att.contentType,
                azureUrl: azureUrl,
                filename: filename,
              });
              attachmentsDownloaded++;
            }
          } catch (e) {
            console.error(`   ❌ Attachment error:`, e.message);
          }
        }
      }

      // Build message object
      const messageObj = {
        id: messageId,
        direction: fullMessage.direction,
        type: processedAttachments.length > 0 ? 'MMS' : (fullMessage.type || 'SMS'),
        subject: extractedText,
        creationTime: fullMessage.creationTime,
        lastModifiedTime: fullMessage.lastModifiedTime,
        readStatus: fullMessage.readStatus || (fullMessage.direction === 'Inbound' ? 'Unread' : 'Read'), // ✅ Use RingCentral's status
        messageStatus: fullMessage.messageStatus,
        from: fullMessage.from,
        to: fullMessage.to,
        attachments: processedAttachments,
      };

      // ════════════════════════════════════════════════════════════════
      // ✅ CRITICAL FIX: Double-check message doesn't exist before inserting
      // This prevents race conditions where message was added during processing
      // ════════════════════════════════════════════════════════════════
      const alreadyExists = await conversationsCollection.findOne({
        conversationId: conversationId,
        'messages.id': messageId
      });

      if (alreadyExists) {
        console.log(`   ⚠️ Message ${messageId} already exists in ${conversationId} - duplicate prevented!`);
        duplicatesPrevented++;
        skipped++;
        continue; // Skip to next message - DO NOT INSERT
      }

      // Safe to insert - message doesn't exist in this conversation
      const updateOperation = {
        $push: {
          messages: {
            $each: [messageObj],
            $sort: { creationTime: 1 },
          },
        },
        $set: {
          conversationId: conversationId,
          participants: participants,
          isGroup: isGroup,
          phoneNumber: primaryPhone,
          lastMessageTime: fullMessage.creationTime,
          lastMessageId: messageId,
        },
      };

      // ✅ FIXED: Only increment unread if message is actually unread
      if (fullMessage.direction === 'Inbound' && fullMessage.readStatus === 'Unread') {
        updateOperation.$inc = { unreadCount: 1 };
      }

      await conversationsCollection.updateOne(
        { conversationId: conversationId },
        updateOperation,
        { upsert: true }
      );

      synced++;
      if (isGroup) {
        groupMessages++;
        console.log(`📨 GROUP: ${conversationId} - "${fullMessage.subject?.substring(0, 30) || 'No text'}"`);
      } else {
        individualMessages++;
        console.log(`📨 INDIVIDUAL: ${conversationId} - "${fullMessage.subject?.substring(0, 30) || 'No text'}"`);
      }
      
      // Broadcast new message
      io.to(`conversation:${conversationId}`).emit('newRingCentralMessage', {
        conversationId: conversationId,
        phoneNumber: primaryPhone,
        messageId: messageId,
        timestamp: fullMessage.creationTime,
        subject: fullMessage.subject || '',
        direction: fullMessage.direction,
        hasAttachments: processedAttachments.length > 0,
        isGroup: isGroup,
      });
    }

    // ════════════════════════════════════════════════════════════════
    // OPTIMIZED: Two-way read status sync with timeout
    // ════════════════════════════════════════════════════════════════
    let readStatusSynced = 0;
    let unreadStatusSynced = 0;
    
    if (!(rateLimitedUntil && Date.now() < rateLimitedUntil)) {
      try {
        // Set a timeout for read status sync (15 seconds max)
        const readSyncPromise = syncReadStatus(platform);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Read sync timeout')), 15000)
        );
        
        const readSyncResult = await Promise.race([readSyncPromise, timeoutPromise]);
        readStatusSynced = readSyncResult.readSynced || 0;
        unreadStatusSynced = readSyncResult.unreadSynced || 0;
      } catch (readSyncError) {
        console.error('❌ Read status sync error:', readSyncError.message);
      }
    }

    const duration = Date.now() - startTime;
    lastSyncTime = new Date().toISOString();
    await syncMissedCalls();
    consecutiveErrors = 0;
    rateLimitedUntil = null;
    
    const shouldLog = synced > 0 || attachmentsDownloaded > 0 || 
                      readStatusSynced > 0 || unreadStatusSynced > 0 || 
                      duplicatesPrevented > 0 || readStatusUpdated > 0 ||
                      duration > 5000;
    
    if (shouldLog) {
      console.log(`✅ Sync completed in ${duration}ms:`);
      console.log(`   - New messages: ${synced} (${groupMessages} group, ${individualMessages} individual)`);
      console.log(`   - Skipped: ${skipped}`);
      console.log(`   - Duplicates prevented: ${duplicatesPrevented}`); // ✅ NEW
      console.log(`   - Read status updated: ${readStatusUpdated}`); // ✅ NEW
      console.log(`   - Attachments: ${attachmentsDownloaded}`);
      console.log(`   - Read synced: ${readStatusSynced}, Unread synced: ${unreadStatusSynced}`);
    }

    isSyncing = false;

    // Run queued sync if one came in while we were syncing
    if (pendingSyncQueued) {
      pendingSyncQueued = false;
      console.log('🔄 Running queued sync...');
      setTimeout(() => syncRingCentralMessages(), 1000);
    }

    return { 
      success: true, 
      synced, 
      groupMessages,
      individualMessages,
      skipped,
      duplicatesPrevented, // ✅ NEW
      readStatusUpdated, // ✅ NEW
      attachmentsDownloaded,
      readStatusSynced, 
      unreadStatusSynced, 
      durationMs: duration 
    };

  } catch (error) {
    console.error(`❌ Sync error:`, error.message);
    isSyncing = false;
    
    if (error.message?.includes('rate') || error.message?.includes('429') || error.message?.includes('Request rate exceeded')) {
      consecutiveErrors++;
      const backoffSeconds = Math.min(60 * Math.pow(2, consecutiveErrors - 1), 300);
      rateLimitedUntil = Date.now() + (backoffSeconds * 1000);
      console.log(`🚫 Rate limited! Backing off for ${backoffSeconds}s`);
      return { success: false, error: 'Rate limited', backoffSeconds };
    }

    if (pendingSyncQueued) {
      pendingSyncQueued = false;
      setTimeout(() => syncRingCentralMessages(), 2000);
    }

    return { success: false, error: error.message };
  }
}

// ================================================
// MISSED CALLS SYNC
// ================================================
async function syncMissedCalls() {
  if (!conversationsCollection) return;

  try {
    const platform = await getRingCentralPlatform();
    const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const response = await platform.get('/restapi/v1.0/account/~/extension/~/call-log', {
      type: 'Voice',
      result: 'Missed',
      dateFrom,
      perPage: 100,
    });

    const data = await response.json();
    const calls = data.records || [];
    let synced = 0;

    for (const call of calls) {
      const callId = call.id.toString();
      const callerPhone = normalizePhone(call.from?.phoneNumber || '');
      if (!callerPhone) continue;

      const conversationId = callerPhone;

      const exists = await conversationsCollection.findOne({ 'messages.id': `call_${callId}` });
      if (exists) continue;

      const messageObj = {
        id: `call_${callId}`,
        direction: 'Inbound',
        type: 'MissedCall',
        subject: '',
        creationTime: call.startTime,
        lastModifiedTime: call.startTime,
        readStatus: 'Unread',
        messageStatus: 'Received',
        from: { phoneNumber: callerPhone },
        to: [{ phoneNumber: MY_PHONE_NUMBER }],
        attachments: [],
        callDuration: call.duration || 0,
      };

      await conversationsCollection.updateOne(
        { conversationId },
        {
          $push: { messages: { $each: [messageObj], $sort: { creationTime: 1 } } },
          $set: {
            conversationId,
            phoneNumber: callerPhone,
            participants: [callerPhone],
            isGroup: false,
            lastMessageTime: call.startTime,
          },
          $inc: { unreadCount: 1 },
        },
        { upsert: true }
      );

      io.to(`conversation:${conversationId}`).emit('newRingCentralMessage', {
        conversationId,
        phoneNumber: callerPhone,
        messageId: `call_${callId}`,
        timestamp: call.startTime,
        subject: '📵 Missed call',
        direction: 'Inbound',
        type: 'MissedCall',
      });

      synced++;
      console.log(`📵 Missed call from ${callerPhone} at ${call.startTime}`);
    }

    if (synced > 0) console.log(`✅ Synced ${synced} missed calls`);
    return { synced };
  } catch (error) {
    console.error('❌ Missed call sync error:', error.message);
    return { synced: 0 };
  }
}

// Separate function for read status sync with better error handling
async function syncReadStatus(platform) {
  let readSynced = 0;
  let unreadSynced = 0;

  const conversationsWithInbound = await conversationsCollection.find(
    { 'messages.direction': 'Inbound' },
    { projection: { conversationId: 1, phoneNumber: 1, 'messages.id': 1, 'messages.direction': 1, 'messages.readStatus': 1 } }
  ).limit(50).toArray();

  const localUnreadIds = new Set();
  const localReadIds = new Set();
  const messageConvMap = new Map();

  for (const conv of conversationsWithInbound) {
    const convId = conv.conversationId || conv.phoneNumber;
    for (const msg of (conv.messages || [])) {
      if (msg.direction === 'Inbound' && msg.id) {
        messageConvMap.set(msg.id, convId);
        if (msg.readStatus === 'Unread') {
          localUnreadIds.add(msg.id);
        } else {
          localReadIds.add(msg.id);
        }
      }
    }
  }

  if (localUnreadIds.size === 0 && localReadIds.size === 0) {
    return { readSynced: 0, unreadSynced: 0 };
  }

  // ── Sync Read: RC says Read, we have Unread ──
  if (localUnreadIds.size > 0) {
    const rcReadMessages = (await (await platform.get(
      '/restapi/v1.0/account/~/extension/~/message-store',
      { messageType: 'SMS', readStatus: 'Read', perPage: 500 }
    )).json()).records || [];

    const rcReadIds = new Set(rcReadMessages.map(m => m.id.toString()));
    const toMarkRead = [];
    for (const msgId of localUnreadIds) {
      if (rcReadIds.has(msgId)) {
        toMarkRead.push({ msgId, convId: messageConvMap.get(msgId) });
      }
    }

    for (const { msgId, convId } of toMarkRead) {
      await conversationsCollection.updateOne(
        { $or: [{ conversationId: convId }, { phoneNumber: convId }], 'messages.id': msgId },
        { $set: { 'messages.$.readStatus': 'Read' } }
      );
      readSynced++;
    }

    const affectedConvs = new Set(toMarkRead.map(t => t.convId));
    for (const convId of affectedConvs) {
      const conv = await conversationsCollection.findOne({
        $or: [{ conversationId: convId }, { phoneNumber: convId }]
      });
      if (conv) {
        const newUnreadCount = (conv.messages || [])
          .filter(m => m.direction === 'Inbound' && m.readStatus === 'Unread').length;
        await conversationsCollection.updateOne(
          { _id: conv._id },
          { $set: { unreadCount: newUnreadCount } }
        );
        io.to(`conversation:${convId}`).emit('readStatusChanged', {
          conversationId: convId,
          unreadCount: newUnreadCount,
        });
        console.log(`📡 Broadcast readStatusChanged for ${convId} → unread: ${newUnreadCount}`);
      }
    }
  }

  // ── Sync Unread: RC says Unread, we have Read ──
  if (localReadIds.size > 0) {
    const rcUnreadMessages = (await (await platform.get(
      '/restapi/v1.0/account/~/extension/~/message-store',
      { messageType: 'SMS', readStatus: 'Unread', perPage: 500 }
    )).json()).records || [];

    const rcUnreadIds = new Set(rcUnreadMessages.map(m => m.id.toString()));
    const toMarkUnread = [];
    for (const msgId of localReadIds) {
      if (rcUnreadIds.has(msgId)) {
        toMarkUnread.push({ msgId, convId: messageConvMap.get(msgId) });
      }
    }

    for (const { msgId, convId } of toMarkUnread) {
      await conversationsCollection.updateOne(
        { $or: [{ conversationId: convId }, { phoneNumber: convId }], 'messages.id': msgId },
        { $set: { 'messages.$.readStatus': 'Unread' } }
      );
      unreadSynced++;
    }

    const affectedUnreadConvs = new Set(toMarkUnread.map(t => t.convId));
    for (const convId of affectedUnreadConvs) {
      const conv = await conversationsCollection.findOne({
        $or: [{ conversationId: convId }, { phoneNumber: convId }]
      });
      if (conv) {
        const newUnreadCount = (conv.messages || [])
          .filter(m => m.direction === 'Inbound' && m.readStatus === 'Unread').length;
        await conversationsCollection.updateOne(
          { _id: conv._id },
          { $set: { unreadCount: newUnreadCount } }
        );
        io.to(`conversation:${convId}`).emit('readStatusChanged', {
          conversationId: convId,
          unreadCount: newUnreadCount,
        });
        console.log(`📡 Broadcast readStatusChanged for ${convId} → unread: ${newUnreadCount}`);
      }
    }
  }

  return { readSynced, unreadSynced };
}

// ================================================
// SCHEDULED MESSAGES PROCESSOR
// ================================================
let isProcessingScheduled = false;

async function processScheduledMessages() {
  if (!scheduleCollection) return;
  if (isProcessingScheduled) {
    console.log('⏳ Scheduled processor already running, skipping...');
    return;
  }

  isProcessingScheduled = true;
  const now = new Date();

  // 90 second lookahead so messages at exact boundary are never skipped
  const cutoff = new Date(now.getTime() + 90 * 1000);

  try {
    // Reset jobs stuck in "processing" for more than 5 minutes
    const stuckCutoff = new Date(now.getTime() - 5 * 60 * 1000);
    const stuckResult = await scheduleCollection.updateMany(
      { status: 'processing', processingStartedAt: { $lt: stuckCutoff } },
      { $set: { status: 'pending', processingStartedAt: null } }
    );
    if (stuckResult.modifiedCount > 0) {
      console.log(`♻️ Reset ${stuckResult.modifiedCount} stuck scheduled job(s)`);
    }

    while (true) {
      // Atomic claim - find pending job and mark processing in one operation
      // prevents double-send if this somehow runs twice simultaneously
      const job = await scheduleCollection.findOneAndUpdate(
        {
          status: 'pending',
          scheduledAt: { $lte: cutoff },
        },
        {
          $set: {
            status: 'processing',
            processingStartedAt: new Date(),
          },
        },
        {
          sort: { scheduledAt: 1 },
          returnDocument: 'after',
        }
      );

      if (!job) break;

      const jobId = job._id.toString();
      const scheduledAt = new Date(job.scheduledAt);
      const msUntilDue = scheduledAt.getTime() - Date.now();

      // If we grabbed a message in our 90s lookahead that isn't due yet, wait
      if (msUntilDue > 1000) {
        console.log(`⏳ Job ${jobId} due in ${Math.round(msUntilDue / 1000)}s, waiting...`);
        await new Promise(resolve => setTimeout(resolve, msUntilDue));
      }

      console.log(`📤 Sending scheduled message ${jobId}`);
      console.log(`   To: [${job.phoneNumbers.join(', ')}]`);
      console.log(`   Scheduled: ${scheduledAt.toISOString()}`);
      const FOOTER = `\n\nNote: This is a scheduled reminder. If this has already been taken care of, please disregard — or reply to update your status.`;
      const messageText = job.message.includes('Note: This is a scheduled reminder')
        ? job.message
        : job.message + FOOTER;


      try {
        const platform = await getRingCentralPlatform();
        const FormData = require('form-data');
        const formData = new FormData();

        const body = {
          from: { phoneNumber: MY_PHONE_NUMBER },
          to: job.phoneNumbers.map(p => ({ phoneNumber: p })),
          text: messageText,
        };

        const jsonBuffer = Buffer.from(JSON.stringify(body), 'utf8');
        formData.append('json', jsonBuffer, {
          filename: 'request.json',
          contentType: 'application/json',
        });

        const response = await platform.post(
          '/restapi/v1.0/account/~/extension/~/sms',
          formData
        );
        const result = await response.json();

        // Save sent message to the conversation in MongoDB
        const conversationId = job.phoneNumbers
          .map(p => normalizePhone(p))
          .filter(p => p !== normalizePhone(MY_PHONE_NUMBER))
          .sort()
          .join(',');

        const messageObj = {
          id: result.id?.toString() || Date.now().toString(),
          direction: 'Outbound',
          type: 'SMS',
          subject: messageText,
          creationTime: new Date(result.creationTime || Date.now()).toISOString(),
          lastModifiedTime: new Date(result.lastModifiedTime || Date.now()).toISOString(),
          readStatus: 'Read',
          messageStatus: 'Sent',
          from: { phoneNumber: MY_PHONE_NUMBER },
          to: job.phoneNumbers.map(p => ({ phoneNumber: p })),
          attachments: [],
          scheduledMessageId: jobId,
        };

        await conversationsCollection.updateOne(
          { conversationId },
          {
            $push: {
              messages: { $each: [messageObj], $sort: { creationTime: 1 } },
            },
            $set: {
              lastMessageTime: messageObj.creationTime,
              lastMessageId: messageObj.id,
            },
            $setOnInsert: {
              conversationId,
              phoneNumber: job.phoneNumbers[0],
              participants: conversationId.split(','),
              isGroup: job.phoneNumbers.length > 1,
            },
          },
          { upsert: true }
        );

        // Mark job as sent
        await scheduleCollection.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'sent',
              sentAt: new Date(),
              messageId: result.id?.toString() || null,
              processingStartedAt: null,
            },
          }
        );

        // Broadcast to any open chat windows
        io.to(`conversation:${conversationId}`).emit('newRingCentralMessage', {
          conversationId,
          phoneNumber: job.phoneNumbers[0],
          messageId: messageObj.id,
          timestamp: messageObj.creationTime,
          subject: messageText,
          direction: 'Outbound',
        });

        console.log(`✅ Scheduled job ${jobId} sent (RC ID: ${result.id})`);

      } catch (sendError) {
        console.error(`❌ Scheduled job ${jobId} failed:`, sendError.message);

        await scheduleCollection.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'failed',
              failedAt: new Date(),
              error: sendError.message || 'Unknown error',
              processingStartedAt: null,
            },
          }
        );
      }
    }

  } catch (error) {
    console.error('❌ Scheduled processor error:', error.message);
  } finally {
    isProcessingScheduled = false;
  }
}

// ================================================
// START SERVER & CRON
// ================================================
async function startServer() {
  const dbConnected = await connectMongoDB();

  if (dbConnected) {
    await connectPaymentLinksDB();
    scheduleDailyDisable();
    await connectSecurityCodeDB();
    scheduleDailySecurityCode();
    // Scheduled messages — run every 60 seconds
    setInterval(processScheduledMessages, 60 * 1000);
    // Run once on startup to catch anything missed during downtime/redeploy
    setTimeout(processScheduledMessages, 8000);
    console.log('⏰ Scheduled messages processor started (every 60s)');
    
    // Generate code on startup if none exists for today
    if (securityCodeCollection) {
      const now = new Date();
      const cstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const existing = await securityCodeCollection.findOne({ type: 'daily_code', generatedDate: cstTime.toDateString() });
      if (!existing) {
        console.log('🔐 No code for today, generating on startup...');
        await generateDailySecurityCode();
        lastCodeDate = cstTime.toDateString();
      } else {
        lastCodeDate = cstTime.toDateString();
        console.log('🔐 Today\'s security code already exists');
      }
    }
}
  
  if (!dbConnected) {
    console.error('Server starting WITHOUT database connection');
    console.error('Chat history and sync features will not work');
  }

  const rcConfigured = process.env.RINGCENTRAL_CLIENT_ID && 
                       process.env.RINGCENTRAL_CLIENT_SECRET && 
                       process.env.RINGCENTRAL_JWT;

  const azureConfigured = !!process.env.AZURE_STORAGE_CONNECTION_STRING;
  console.log(`☁️  Azure Storage: ${azureConfigured ? 'Configured' : 'NOT configured - attachments will not be saved'}`);

  if (rcConfigured) {
    const syncIntervalMs = parseInt(process.env.SYNC_INTERVAL_MS || '60000', 10);
    
    console.log(`\n📅 RingCentral Sync Interval: ${syncIntervalMs}ms (${syncIntervalMs/1000}s)`);
    
    setTimeout(() => {
      console.log('🚀 Running initial RingCentral sync...');
      syncRingCentralMessages();
    }, 5000);

    setInterval(async () => {
      await syncRingCentralMessages();
    }, syncIntervalMs);

    const updateNextSyncTime = () => {
      nextSyncTime = new Date(Date.now() + syncIntervalMs).toISOString();
    };
    updateNextSyncTime();
    setInterval(updateNextSyncTime, syncIntervalMs);

    console.log('✅ RingCentral sync scheduled\n');
  } else {
    console.log('\n⚠️  RingCentral not configured - sync disabled');
    console.log('   Set RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET, RINGCENTRAL_JWT to enable\n');
  }
}

startServer();


// ================================================
// SOCKET.IO HANDLERS (ALL ORIGINAL HANDLERS PRESERVED)
// ================================================
const activeSessions = new Map();
const adminSockets = new Set();
const agentWaitTimers = new Map();

// Send SMS notification when no agent connects
async function sendNoAgentNotification(session) {
  try {
    const message = `URGENT: Customer ${session.userName} (${session.userPhone}) has been waiting for 5 minutes without an agent response. Live chat needs attention!`;
    const encodedMessage = encodeURIComponent(message);
    const toNumber = '+19727486404';
    const smsUrl = `https://astraldbapi.herokuapp.com/message_send_link/?message=${encodedMessage}&To=${toNumber}`;
    
    await fetch(smsUrl);
    console.log('Sent no-agent notification SMS for:', session.userName);
  } catch (error) {
    console.error('Failed to send SMS notification:', error);
  }
}

// Save chat history to MongoDB
async function saveChatHistory(session) {
  if (!liveChatHistoryCollection) return;
  
  try {
    await liveChatHistoryCollection.updateOne(
      { userId: session.userId },
      {
        $set: {
          userId: session.userId,
          userName: session.userName,
          userPhone: session.userPhone,
          conversationHistory: session.conversationHistory,
          hasAgent: session.hasAgent,
          agentName: session.agentName,
          joinedAt: session.joinedAt,
          lastSeen: session.lastSeen,
          isActive: session.isActive,
          customerEnded: session.customerEnded || false,
          adminEnded: session.adminEnded || false,
          endedAt: session.endedAt || null,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving to MongoDB:', error);
  }
}

// Load chat history from MongoDB
async function loadChatHistory(userId) {
  if (!liveChatHistoryCollection) return null;
  
  try {
    return await liveChatHistoryCollection.findOne({ userId });
  } catch (error) {
    console.error('Error loading from MongoDB:', error);
    return null;
  }
}

app.post('/disable-todays-links', async (req, res) => {
  try {
    console.log('📱 Manual disable triggered');
    const result = await disableTodaysPaymentLinks();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/check-links-to-disable', async (req, res) => {
  try {
    if (!paymentLinksCollection) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const now = new Date();
    const cstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    
    const startOfToday = new Date(cstTime);
    startOfToday.setHours(0, 0, 0, 0);
    
    const endOfToday = new Date(cstTime);
    endOfToday.setHours(23, 59, 59, 999);

    const linksToDisable = await paymentLinksCollection.find({
      linkType: 'payment',
      disabled: { $ne: true }
    }).toArray();

    res.json({
      count: linksToDisable.length,
      date: cstTime.toLocaleDateString(),
      time: cstTime.toLocaleTimeString(),
      links: linksToDisable.map(l => ({
        id: l._id.toString(),
        amount: (l.amount / 100).toFixed(2),
        phone: l.customerPhone,
        description: l.description,
        link: l.generatedLink,
        createdAt: l.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/verify-security-code', async (req, res) => {
  try {
    if (!securityCodeCollection) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const { code } = req.body;
    if (!code) {
      return res.json({ valid: false, error: 'No code provided' });
    }

    const activeCode = await securityCodeCollection.findOne({ type: 'daily_code' });
    
    if (!activeCode) {
      return res.json({ valid: false, error: 'No active code found' });
    }

    const isValid = activeCode.code === code;
    return res.json({ valid: isValid });
  } catch (error) {
    return res.status(500).json({ valid: false, error: error.message });
  }
});

app.post('/trigger-scheduled', async (req, res) => {
  console.log('📅 Manual scheduled messages trigger');
  processScheduledMessages();
  res.json({ success: true });
});

app.get('/scheduled-status', async (req, res) => {
  try {
    if (!scheduleCollection) return res.status(500).json({ error: 'DB not connected' });
    const [pending, sent, failed, processing] = await Promise.all([
      scheduleCollection.countDocuments({ status: 'pending' }),
      scheduleCollection.countDocuments({ status: 'sent' }),
      scheduleCollection.countDocuments({ status: 'failed' }),
      scheduleCollection.countDocuments({ status: 'processing' }),
    ]);
    res.json({ pending, sent, failed, processing, isProcessing: isProcessingScheduled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id, 'at', new Date().toISOString());

  // Allow clients to join RingCentral conversation rooms
  socket.on('join-conversation', ({ phoneNumber, conversationId }) => {
    const roomId = conversationId || phoneNumber;
    if (roomId) {
      socket.join(`conversation:${roomId}`);
      console.log(`Socket ${socket.id} joined conversation:${roomId}`);
    }
  });

  socket.on('leave-conversation', ({ phoneNumber, conversationId }) => {
    const roomId = conversationId || phoneNumber;
    if (roomId) {
      socket.leave(`conversation:${roomId}`);
      console.log(`Socket ${socket.id} left conversation:${roomId}`);
    }
  });

  socket.on('admin-join', async () => {
    adminSockets.add(socket.id);
    socket.join('admins');
    console.log('Admin joined:', socket.id);
    
    const activeSessionsArray = Array.from(activeSessions.values());
    
    let recentChats = [];
    if (liveChatHistoryCollection) {
      try {
        recentChats = await liveChatHistoryCollection
          .find()
          .sort({ lastSeen: -1 })
          .limit(20)
          .toArray();
      } catch (error) {
        console.error('Error loading recent chats:', error);
      }
    }
    
    const activeUserIds = new Set(activeSessionsArray.map(s => s.userId));
    const historicalChats = recentChats.filter(chat => !activeUserIds.has(chat.userId));
    
    const allSessions = [...activeSessionsArray, ...historicalChats];
    
    socket.emit('active-sessions', allSessions);
    socket.emit('admin-connected', { success: true });
  });

  socket.on('load-more-chats', async ({ skip = 0, limit = 20 }) => {
    if (!liveChatHistoryCollection) {
      socket.emit('more-chats', { chats: [], hasMore: false });
      return;
    }
    
    try {
      const chats = await liveChatHistoryCollection
        .find()
        .sort({ lastSeen: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      
      const totalCount = await liveChatHistoryCollection.countDocuments();
      const hasMore = (skip + limit) < totalCount;
      
      socket.emit('more-chats', { chats, hasMore, total: totalCount });
      console.log(`Loaded ${chats.length} more chats (skip: ${skip})`);
    } catch (error) {
      console.error('Error loading more chats:', error);
      socket.emit('more-chats', { chats: [], hasMore: false });
    }
  });

  socket.on('admin-delete-chat', async ({ userId, adminName }) => {
    try {
      console.log(`Admin ${adminName} requesting deletion of chat ${userId}`);
      
      if (!db || !liveChatHistoryCollection) {
        console.error('Database not available');
        socket.emit('delete-error', { 
          message: 'Database connection not available. Please try again.' 
        });
        return;
      }
      
      const chatToDelete = await liveChatHistoryCollection.findOne({ userId: userId });
      
      if (!chatToDelete) {
        console.log(`No chat found in database for user ${userId}`);
        socket.emit('delete-error', { 
          message: 'Chat not found in database.' 
        });
        return;
      }
      
      if (deletedChatsCollection) {
        const deletedRecord = {
          ...chatToDelete,
          deletedBy: adminName,
          deletedAt: new Date().toISOString(),
          originalChatId: chatToDelete._id,
          messageCount: chatToDelete.conversationHistory?.length || 0,
          chatDuration: calculateChatDuration(chatToDelete.joinedAt, chatToDelete.lastSeen),
        };
        
        await deletedChatsCollection.insertOne(deletedRecord);
        console.log(`Saved deleted chat to history: ${userId}`);
      }
      
      const result = await liveChatHistoryCollection.deleteOne({ userId: userId });
      
      if (result.deletedCount > 0) {
        console.log(`Chat deleted from active chats for user ${userId}`);
        
        activeSessions.delete(userId);
        
        const timer = agentWaitTimers.get(userId);
        if (timer) {
          clearTimeout(timer);
          agentWaitTimers.delete(userId);
        }
        
        io.to('admins').emit('chat-deleted', { 
          userId, 
          deletedBy: adminName 
        });
        
        io.to(`customer-${userId}`).emit('session-ended', {
          message: 'This chat session has been closed by an administrator.'
        });
        
        console.log(`All deletion notifications sent for ${userId}`);
      }
    } catch (error) {
      console.error('Error during chat deletion:', error);
      socket.emit('delete-error', { 
        message: `Failed to delete chat: ${error.message}`,
        error: error.message 
      });
    }
  });

  function calculateChatDuration(joinedAt, lastSeen) {
    try {
      const start = new Date(joinedAt);
      const end = new Date(lastSeen || new Date());
      const durationMs = end.getTime() - start.getTime();
      const minutes = Math.floor(durationMs / 60000);
      
      if (minutes < 1) return "< 1 min";
      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMins = minutes % 60;
        return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
      }
      return `${minutes} min`;
    } catch (error) {
      return "Unknown";
    }
  }

  socket.on('get-deleted-chats', async ({ skip = 0, limit = 20 }) => {
    if (!deletedChatsCollection) {
      socket.emit('deleted-chats-response', { chats: [], hasMore: false, total: 0 });
      return;
    }
    
    try {
      const deletedChats = await deletedChatsCollection
        .find()
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      
      const totalCount = await deletedChatsCollection.countDocuments();
      const hasMore = (skip + limit) < totalCount;
      
      socket.emit('deleted-chats-response', { 
        chats: deletedChats, 
        hasMore, 
        total: totalCount 
      });
      
      console.log(`Sent ${deletedChats.length} deleted chats to admin`);
    } catch (error) {
      console.error('Error loading deleted chats:', error);
      socket.emit('deleted-chats-response', { chats: [], hasMore: false, total: 0 });
    }
  });

  socket.on('restore-deleted-chat', async ({ deletedChatId, adminName }) => {
    if (!deletedChatsCollection || !liveChatHistoryCollection) {
      socket.emit('restore-error', { message: 'Database not available' });
      return;
    }
    
    try {
      const { ObjectId } = require('mongodb');
      
      let objectId;
      try {
        objectId = new ObjectId(deletedChatId);
      } catch (err) {
        socket.emit('restore-error', { message: 'Invalid chat ID format' });
        return;
      }
      
      const deletedChat = await deletedChatsCollection.findOne({ _id: objectId });
      
      if (!deletedChat) {
        console.log(`Deleted chat not found with ID: ${deletedChatId}`);
        socket.emit('restore-error', { message: 'Deleted chat not found' });
        return;
      }
      
      const { deletedBy, deletedAt, originalChatId, messageCount, chatDuration, _id, ...chatToRestore } = deletedChat;
      
      await liveChatHistoryCollection.insertOne({
        ...chatToRestore,
        restoredBy: adminName,
        restoredAt: new Date().toISOString(),
        isActive: false,
        customerEnded: false,
        adminEnded: false,
      });
      
      await deletedChatsCollection.deleteOne({ _id: objectId });
      
      socket.emit('restore-success', { 
        message: 'Chat restored successfully',
        userId: chatToRestore.userId 
      });
      
      io.to('admins').emit('chat-restored', { userId: chatToRestore.userId });
      
    } catch (error) {
      console.error('Error restoring chat:', error);
      socket.emit('restore-error', { 
        message: `Failed to restore chat: ${error.message}` 
      });
    }
  });

  socket.on('delete-message', async ({ messageId, userId }) => {
    try {
      if (!db || !liveChatHistoryCollection) {
        console.error('Database not available');
        socket.emit('delete-error', { 
          message: 'Database connection not available. Please try again.' 
        });
        return;
      }

      const result = await liveChatHistoryCollection.updateOne(
        { userId: userId },
        { $pull: { conversationHistory: { id: messageId } } }
      );

      if (result.modifiedCount > 0) {
        const session = activeSessions.get(userId);
        if (session) {
          session.conversationHistory = session.conversationHistory.filter(
            msg => msg.id !== messageId
          );
        }

        io.to(`customer-${userId}`).emit('message-deleted', { messageId });
        io.to('admins').emit('message-deleted', { messageId });
        
      } else {
        socket.emit('delete-error', { 
          message: 'Message not found. It may have already been deleted.' 
        });
      }
    } catch (err) {
      console.error('Error deleting message:', err);
      socket.emit('delete-error', { 
        message: `Failed to delete message: ${err.message}`,
        error: err.message 
      });
    }
  });

  socket.on('customer-join', async ({ userId, userName, userPhone, conversationHistory }) => {
    let sessionData = activeSessions.get(userId);
    
    if (sessionData) {
      sessionData.socketId = socket.id;
      sessionData.isActive = true;
      sessionData.lastSeen = new Date().toISOString();
      
      socket.emit('chat-history', sessionData.conversationHistory);
      io.to('admins').emit('customer-reconnected', sessionData);
    } else {
      const savedSession = await loadChatHistory(userId);
      
      if (savedSession && !savedSession.customerEnded && !savedSession.adminEnded) {
        sessionData = {
          ...savedSession,
          socketId: socket.id,
          isActive: true,
          lastSeen: new Date().toISOString()
        };
        socket.emit('chat-history', sessionData.conversationHistory);
      } else {
        sessionData = {
          userId,
          userName,
          userPhone,
          socketId: socket.id,
          joinedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          isActive: true,
          hasAgent: false,
          conversationHistory: conversationHistory || []
        };
      }
      
      activeSessions.set(userId, sessionData);
      io.to('admins').emit('customer-joined', sessionData);
      
      const timer = setTimeout(() => {
        const session = activeSessions.get(userId);
        if (session && !session.hasAgent && session.isActive) {
          sendNoAgentNotification(session);
        }
      }, 5 * 60 * 1000);
      
      agentWaitTimers.set(userId, timer);
    }
    
    socket.join(`customer-${userId}`);
    await saveChatHistory(sessionData);
  });

  socket.on('admin-claim-customer', async ({ userId, adminName }) => {
    const session = activeSessions.get(userId);
    if (session && !session.hasAgent) {
      const timer = agentWaitTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        agentWaitTimers.delete(userId);
      }
      
      session.hasAgent = true;
      session.agentName = adminName;
      session.agentSocketId = socket.id;
      session.claimedAt = new Date().toISOString();
      
      socket.join(`customer-${userId}`);
      
      io.to(`customer-${userId}`).emit('agent-joined', {
        agentName: adminName,
        message: `${adminName} has joined the chat`
      });
      
      io.to('admins').emit('session-updated', session);
      await saveChatHistory(session);
    }
  });

  socket.on('customer-message', async ({ userId, userName, content, fileUrl, fileName }) => {
    const session = activeSessions.get(userId);
    if (session) {
      session.lastSeen = new Date().toISOString();
      
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        userName,
        content,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        isAdmin: false,
        timestamp: new Date().toISOString()
      };
      
      session.conversationHistory.push(message);
      
      io.to(`customer-${userId}`).emit('new-message', message);
      io.to('admins').emit('customer-message-notification', { userId, userName, message });
      
      await saveChatHistory(session);
    }
  });

  socket.on('admin-message', async ({ userId, agentName, content, fileUrl, fileName }) => {
    const session = activeSessions.get(userId);
    if (session) {
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        userName: agentName,
        content,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        isAdmin: true,
        timestamp: new Date().toISOString(),
        read: false
      };
      
      session.conversationHistory.push(message);
      
      io.to(`customer-${userId}`).emit('new-message', message);
      io.to('admins').emit('admin-message-sent', { userId, message });
      
      await saveChatHistory(session);
    }
  });

  socket.on('admin-typing', ({ userId, isTyping, agentName }) => {
    io.to(`customer-${userId}`).emit('admin-typing-indicator', { isTyping, agentName });
  });

  socket.on('customer-typing', ({ userId, isTyping }) => {
    io.to('admins').emit('customer-typing-indicator', { userId, isTyping });
  });

  socket.on('end-session', async ({ userId }) => {
    const session = activeSessions.get(userId);
    if (session) {
      session.isActive = false;
      session.adminEnded = true;
      session.endedAt = new Date().toISOString();
      
      io.to(`customer-${userId}`).emit('session-ended', {
        message: `${session.agentName} has ended the chat session. Thank you for contacting us!`
      });
      
      io.to('admins').emit('session-ended', { userId });
      
      const timer = agentWaitTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        agentWaitTimers.delete(userId);
      }
      
      await saveChatHistory(session);
      setTimeout(() => activeSessions.delete(userId), 30 * 60 * 1000);
    }
  });

  socket.on('customer-end-session', async ({ userId }) => {
    const session = activeSessions.get(userId);
    if (session) {
      session.isActive = false;
      session.customerEnded = true;
      session.endedAt = new Date().toISOString();
      
      io.to('admins').emit('customer-ended-session', {
        userId,
        userName: session.userName,
        message: `${session.userName} has ended the chat session.`
      });
      
      io.to('admins').emit('session-ended', { userId });
      
      const timer = agentWaitTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        agentWaitTimers.delete(userId);
      }
      
      await saveChatHistory(session);
      setTimeout(() => activeSessions.delete(userId), 30 * 60 * 1000);
      
      socket.emit('session-end-confirmed');
    }
  });

  socket.on('disconnect', async (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
    
    if (adminSockets.has(socket.id)) {
      adminSockets.delete(socket.id);
      for (const [userId, session] of activeSessions.entries()) {
        if (session.agentSocketId === socket.id) {
          session.hasAgent = false;
          delete session.agentName;
          delete session.agentSocketId;
          
          io.to('admins').emit('session-updated', session);
          io.to(`customer-${userId}`).emit('agent-left', { message: 'Agent has disconnected' });
          await saveChatHistory(session);
        }
      }
    }
    
    for (const [userId, session] of activeSessions.entries()) {
      if (session.socketId === socket.id) {
        session.isActive = false;
        session.lastSeen = new Date().toISOString();
        io.to('admins').emit('customer-disconnected', { userId, session });
        await saveChatHistory(session);
      }
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Cleanup inactive sessions every 5 minutes
setInterval(async () => {
  const now = new Date();
  for (const [userId, session] of activeSessions.entries()) {
    const lastSeen = new Date(session.lastSeen);
    const minutesInactive = (now - lastSeen) / (1000 * 60);
    
    if (minutesInactive > 120) {
      await saveChatHistory(session);
      activeSessions.delete(userId);
      
      const timer = agentWaitTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        agentWaitTimers.delete(userId);
      }
    }
  }
}, 5 * 60 * 1000);

io.engine.on('connection_error', (err) => {
  console.error('Connection error:', err);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`RingCentral real-time endpoint: POST /notify/ringcentral`);
  console.log(`Health check: GET /health`);
  console.log(`Manual sync trigger: POST /trigger-sync`);
  console.log(`🧹 Cleanup endpoint: POST /cleanup-duplicates`);
  console.log(`Server ready at ${new Date().toISOString()}`);
  console.log(`Manual disable links: POST /disable-todays-links`);
  console.log(`Check links status: GET /check-links-to-disable`);
});