// app/api/chat/route.ts
import { NextResponse } from "next/server";

interface ChatMessage {
  role: string;
  content: string;
}

interface ContextAnalysis {
  isAccident: boolean;
  isClaim: boolean;
  isQuoteRequest: boolean;
  isPayment: boolean;
  isInformational: boolean;
  suggestedAction: string | null;
}

// Check if user is requesting a live agent
function isLiveAgentRequest(userMessage: string): boolean {
  const lowerMessage = userMessage.toLowerCase().trim();
  
  const liveAgentKeywords = [
    'live agent',
    'live chat',
    'chat with someone',
    'real person',
    'human agent',
    'speak to someone',
    'talk to someone',
    'representative',
    'customer service',
    'speak with agent',
    'talk to agent',
    'human help',
    'real help',
    'actual person',
    'transfer me',
    'connect me to',
    'speak to representative',
    'live support',
    'live person',
    'speak to human',
    'talk to human',
    'real agent',
    'customer support',
    'support agent',
    'help desk',
    'live help',
    'speak with someone',
    'talk with someone',
    'connect to agent'
  ];
  
  return liveAgentKeywords.some(keyword => lowerMessage.includes(keyword));
}

// Check if AI response contains contact suggestion (phone/email)
function containsContactSuggestion(aiResponse: string): boolean {
  const lowerText = aiResponse.toLowerCase();
  const originalText = aiResponse;
  
  // Check for YOUR specific phone number (469) 729-5185 in any format
  const hasYourPhoneNumber = 
    lowerText.includes("469") && lowerText.includes("729") && lowerText.includes("5185") ||
    originalText.includes("4697295185") ||
    originalText.includes("469-729-5185") ||
    originalText.includes("(469) 729-5185") ||
    originalText.includes("469.729.5185");
  
  // Check for YOUR specific email address
  const hasYourEmail = 
    lowerText.includes("support@texaspremiumins.com") ||
    lowerText.includes("support@texaspremiumins");
  
  // Return true ONLY if it contains YOUR contact information
  return hasYourPhoneNumber || hasYourEmail;
}

function analyzeContext(messages: ChatMessage[]): ContextAnalysis {
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
  const fullConversation = messages.map((m) => m.content).join(' ').toLowerCase();
  
  const accidentKeywords = ['accident', 'crash', 'hit', 'collision', 'damage', 'flipped', 'tree', 'fault', 'police report', 'cops', 'officer', 'wreck', 'totaled'];
  const claimKeywords = ['file claim', 'report claim', 'submit claim', 'open claim', 'start claim', 'file a claim', 'report a claim'];
  const quoteKeywords = ['quote', 'price', 'cost', 'how much', 'buy insurance', 'get insurance', 'need insurance', 'shop', 'purchase', 'rate'];
  const paymentKeywords = ['pay', 'payment', 'bill', 'invoice', 'due', 'owe'];
  const informationalKeywords = ['what', 'how', 'why', 'when', 'where', 'explain', 'tell me', 'understand', 'work', 'process'];
  
  const hasAccidentContext = accidentKeywords.some(word => fullConversation.includes(word));
  const hasClaimMention = claimKeywords.some(phrase => lastMessage.includes(phrase));
  const hasQuoteRequest = quoteKeywords.some(word => lastMessage.includes(word)) && !hasAccidentContext;
  const hasPaymentMention = paymentKeywords.some(word => lastMessage.includes(word));
  const isAsking = informationalKeywords.some(word => lastMessage.includes(word)) || lastMessage.includes('?');
  
  let suggestedAction = null;
  
  if (hasAccidentContext && hasClaimMention) {
    suggestedAction = 'claim_assistance';
  } else if (hasAccidentContext && !hasClaimMention && !hasQuoteRequest) {
    suggestedAction = 'offer_claim_help';
  } else if (hasQuoteRequest && !hasAccidentContext) {
    suggestedAction = 'quote';
  } else if (hasPaymentMention && !hasAccidentContext) {
    suggestedAction = 'payment';
  } else if (isAsking) {
    suggestedAction = 'information';
  }
  
  return {
    isAccident: hasAccidentContext,
    isClaim: hasClaimMention,
    isQuoteRequest: hasQuoteRequest,
    isPayment: hasPaymentMention,
    isInformational: isAsking,
    suggestedAction
  };
}

// Enhanced function to detect insurance types and determine if quote button should show
function detectInsuranceTypes(userMessage: string, aiResponse: string): string[] {
  const combined = (userMessage + ' ' + aiResponse).toLowerCase();
  
  const detectedTypes: string[] = [];
  
  // VEHICLES
  if (combined.includes('auto') || combined.includes('car insurance') || combined.includes('vehicle insurance')) {
    detectedTypes.push('auto');
  }
  if (combined.includes('motorcycle') || combined.includes('bike insurance')) {
    detectedTypes.push('motorcycle');
  }
  if (combined.includes('boat') || combined.includes('watercraft') || combined.includes('marine insurance')) {
    detectedTypes.push('boats');
  }
  if (combined.includes('rv') || combined.includes('recreational vehicle') || combined.includes('motorhome') || combined.includes('camper')) {
    detectedTypes.push('rv');
  }
  if (combined.includes('sr22') || combined.includes('sr-22') || combined.includes('sr 22')) {
    detectedTypes.push('sr22');
  }
  
  // PROPERTY
  if (combined.includes('homeowner') || combined.includes('home insurance') || combined.includes('house insurance')) {
    detectedTypes.push('homeowners');
  }
  if (combined.includes('renter') || combined.includes('renters insurance') || combined.includes('apartment insurance')) {
    detectedTypes.push('renters');
  }
  if (combined.includes('mobile home') || combined.includes('manufactured home') || combined.includes('trailer home')) {
    detectedTypes.push('mobile-home');
  }
  
  // COMMERCIAL
  if (combined.includes('commercial auto') || (combined.includes('commercial') && combined.includes('auto'))) {
    detectedTypes.push('commercial-auto');
  }
  if (combined.includes('general liability') || combined.includes('business liability')) {
    detectedTypes.push('general-liability');
  }
  
  // AND MORE
  if (combined.includes('mexico') || combined.includes('tourist')) {
    detectedTypes.push('mexico-tourist');
  }
  if (combined.includes('surety') || combined.includes('bond')) {
    detectedTypes.push('surety-bond');
  }
  
  return detectedTypes;
}

// Determine if we should show a quote button
function shouldShowQuoteButton(userMessage: string, aiResponse: string, detectedTypes: string[]): boolean {
  const userLower = userMessage.toLowerCase();
  const responseLower = aiResponse.toLowerCase();
  
  // Don't show buttons if user is filing claims or making payments
  if (userLower.includes('file a claim') || userLower.includes('make a payment')) {
    return false;
  }
  
  // Check for document requests
  if (userLower.includes('document') || 
      userLower.includes('policy doc') ||
      userLower.includes('my policy') ||
      userLower.includes('view policy') ||
      userLower.includes('see my policy') ||
      userLower.includes('get my policy')) {
    return false; // Will be handled separately
  }
  
  // Show button if any insurance type was detected AND:
  if (detectedTypes.length > 0) {
    // User explicitly asked for a quote
    if (userLower.includes('quote') || 
        userLower.includes('get a') ||
        userLower.includes('i want') ||
        userLower.includes('i need') ||
        userLower.includes('looking for') ||
        userLower.includes('interested in') ||
        userLower.includes('can i get') ||
        userLower.includes('how much') ||
        userLower.includes('cost') ||
        userLower.includes('price')) {
      return true;
    }
    
    // AI mentioned getting a quote or helping with insurance
    if (responseLower.includes('quote') ||
        responseLower.includes('get started') ||
        responseLower.includes('provide') ||
        responseLower.includes('would you like')) {
      return true;
    }
    
    // User said affirmative response after insurance was discussed
    if ((userLower === 'yes' || 
         userLower === 'sure' || 
         userLower === 'okay' || 
         userLower === 'ok' ||
         userLower === 'yes please') && detectedTypes.length > 0) {
      return true;
    }
  }
  
  return false;
}

// Check if user is requesting documents
function isDocumentRequest(userMessage: string): boolean {
  const userLower = userMessage.toLowerCase();
  return userLower.includes('document') || 
         userLower.includes('policy doc') ||
         userLower.includes('my policy') ||
         userLower.includes('view policy') ||
         userLower.includes('see my policy') ||
         userLower.includes('get my policy') ||
         userLower.includes('show my policy') ||
         userLower.includes('policy paper') ||
         userLower.includes('id card') ||
         userLower.includes('insurance card') ||
         userLower.includes('declaration page') ||
         userLower.includes('dec page');
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  try {
    const userMessage = messages[messages.length - 1]?.content || '';
    
    // Check for live agent request FIRST - before any AI processing
    if (isLiveAgentRequest(userMessage)) {
      return NextResponse.json({
        choices: [
          {
            message: {
              content: "I'd be happy to connect you with a live agent! Please provide your name and phone number so we can get you connected.",
              requestLiveAgent: true,
              quoteType: null,
              quoteTypes: null,
              showDocuments: false
            },
          },
        ],
      });
    }

    const context = analyzeContext(messages);
    
    // console.log('Context Analysis:', context);
    // console.log('User Message:', userMessage);

    // Build dynamic system prompt
    let systemPrompt = "You are Samantha, the chatbot for Texas Premium Insurance Services. ";
    
    if (context.isAccident) {
      systemPrompt += "The user has been in an accident. Be empathetic and focus on helping them with their immediate needs. ";
      systemPrompt += "DO NOT try to sell them new insurance. ";
      systemPrompt += "ONLY offer to help them file a claim if they specifically ask about filing claims. ";
    } else if (context.isQuoteRequest) {
      systemPrompt += "The user is interested in getting an insurance quote. Be helpful and guide them toward the right type of coverage. ";
    } else if (context.isPayment) {
      systemPrompt += "The user wants to make a payment or has questions about billing. Guide them to their payment options. ";
    } else {
      systemPrompt += "Be helpful and informative about insurance topics. ";
    }
    
    systemPrompt += 
      "We offer online quotes for: Auto, Motorcycle, Boats & Watercraft, RV, SR-22, Homeowners, Renters, Mobile Home, Commercial Auto, General Liability, Mexico Tourist, and Surety Bond insurance in Texas. " +
      "We also offer Business Owner's Policy (BOP), Workers Compensation, and Errors & Omissions (E&O) insurance, but customers need to call (469) 729-5185 for quotes on these specialized coverages. " +
      "Do NOT mention health or life insurance. " +
      "Keep answers short, clear, and easy to understand (2-3 sentences maximum). " +
      "Always sound friendly and helpful. " +
      "If a user asks about BOP, Workers Comp, or E&O, explain briefly and direct them to call for quotes. " +
      "If a user needs specific account assistance, say: 'Please call us at (469) 729-5185 or email support@TexasPremiumIns.com.' " +
      "NEVER include JSON snippets or technical markup in your responses. " +
      "DO NOT be pushy about filing claims - only offer claim assistance if they explicitly ask.";

    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 200
      }),
    });

    if (!apiRes.ok) {
      const errorData = await apiRes.json().catch(() => ({}));
      console.error('AI API Error:', errorData);
      
      return NextResponse.json({
        choices: [
          {
            message: {
              content: "I'm having trouble connecting right now, Try asking the same questions in few seconds. Please call us at (469) 729-5185 for immediate assistance.",
              quoteType: null,
              quoteTypes: null,
              requestLiveAgent: true, // Show live chat button on errors
              showDocuments: false
            },
          },
        ],
      });
    }

    const data = await apiRes.json();
    let content = data.choices?.[0]?.message?.content || "I'm having trouble responding. Please call us at (469) 729-5185.";
    
    // Clean up any JSON that might have leaked through
    content = content.replace(/\{[^}]*quoteType[^}]*\}/g, '').trim();
    
    // Check if AI response contains contact suggestion (phone/email)
    const hasContactSuggestion = containsContactSuggestion(content);
    
    // Detect insurance types mentioned in user message and AI response
    const detectedTypes = detectInsuranceTypes(userMessage, content);
    
    // Check for document request
    const requestingDocuments = isDocumentRequest(userMessage);
    
    // Determine if we should show quote buttons
    const showButton = shouldShowQuoteButton(userMessage, content, detectedTypes);
    
    // console.log('Detected Types:', detectedTypes);
    // console.log('Show Button:', showButton);
    // console.log('Document Request:', requestingDocuments);
    // console.log('Has Contact Suggestion:', hasContactSuggestion);
    
    // Return appropriate button type
    let quoteTypes = null;
    let documentButton = false;
    let liveAgentButton = false;
    
    if (requestingDocuments) {
      documentButton = true;
    } else if (showButton && detectedTypes.length > 0) {
      quoteTypes = detectedTypes;
    }
    
    // Show live agent button if AI suggested calling/emailing
    if (hasContactSuggestion) {
      liveAgentButton = true;
    }
    
    return NextResponse.json({
      choices: [
        {
          message: {
            content,
            quoteType: quoteTypes && quoteTypes.length === 1 ? quoteTypes[0] : null,
            quoteTypes: quoteTypes && quoteTypes.length > 1 ? quoteTypes : null,
            showDocuments: documentButton,
            requestLiveAgent: liveAgentButton
          },
        },
      ],
    });
    
  } catch (error) {
    console.error('Route error:', error);
    return NextResponse.json({
      choices: [
        {
          message: {
            content: "I'm experiencing technical difficulties. Please call us at (469) 729-5185 for assistance.",
            quoteType: null,
            quoteTypes: null,
            requestLiveAgent: true, // Show live chat button on errors
            showDocuments: false
          },
        },
      ],
    });
  }
}