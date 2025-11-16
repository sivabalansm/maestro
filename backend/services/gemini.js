import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from backend directory (one level up from services/)
dotenv.config({ path: join(__dirname, '..', '.env') });

// Get API key from environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log("API Key:", GEMINI_API_KEY);
if (!GEMINI_API_KEY) {
  console.warn('[Gemini] WARNING: GEMINI_API_KEY not found in environment variables');
  console.warn('[Gemini] Please set GEMINI_API_KEY in backend/.env file');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');

// Token limits for Gemini 2.5 Flash
const MAX_TOKENS = 1000000; // 1M tokens
const TOKEN_CHAR_RATIO = 4; // Roughly 1 token = 4 characters
const MAX_CHARS_FOR_PAGE_CONTEXT = (MAX_TOKENS * TOKEN_CHAR_RATIO) * 0.7; // Use 70% for page context, reserve 30% for system prompt, context, etc.

// Helper function to estimate token count (rough approximation)
function estimateTokens(text) {
  return Math.ceil(text.length / TOKEN_CHAR_RATIO);
}

// Helper function to truncate page context if it exceeds token limit
function truncatePageContext(pageData, maxChars) {
  if (pageData.interactiveElements) {
    // Start with essential metadata
    let pageContext = `Current page information:
URL: ${pageData.url}
Title: ${pageData.title}
${pageData.description ? `Description: ${pageData.description}\n` : ''}`;

    // Add headings (usually small)
    if (pageData.headings && pageData.headings.length > 0) {
      const headingsText = `Headings:\n${pageData.headings.map(h => `  ${'#'.repeat(h.level)} ${h.text}`).join('\n')}\n`;
      if (pageContext.length + headingsText.length <= maxChars) {
        pageContext += headingsText;
      }
    }

    // Sort interactive elements by priority (elements with labels are more important)
    const sortedElements = [...pageData.interactiveElements].sort((a, b) => {
      const aPriority = (a.label ? 2 : 0) + (a.type === 'button' || a.type === 'input' ? 1 : 0);
      const bPriority = (b.label ? 2 : 0) + (b.type === 'button' || b.type === 'input' ? 1 : 0);
      return bPriority - aPriority;
    });

    // Build interactive elements list, truncating if needed
    const elementsHeader = `Interactive elements (${pageData.interactiveElements.length} total, showing first `;
    let elementsList = '';
    let elementCount = 0;
    let truncated = false;

    for (const el of sortedElements) {
      const elementText = `${elementCount + 1}. ${el.type} - Selector: "${el.selector}"${el.label ? ` - Label: "${el.label}"` : ''}${el.value ? ` - Value: "${el.value}"` : ''}\n`;
      
      // Check if adding this element would exceed the limit
      const totalLength = pageContext.length + elementsHeader.length + elementsList.length + elementText.length + 50; // 50 for closing text
      
      if (totalLength > maxChars) {
        truncated = true;
        break;
      }
      
      elementsList += elementText;
      elementCount++;
    }

    pageContext += elementsHeader + (truncated ? `${elementCount} due to token limit` : `${elementCount}`) + '):\n';
    pageContext += elementsList;
    
    if (truncated) {
      pageContext += `\n[Note: Page has ${pageData.interactiveElements.length} total interactive elements, but only showing first ${elementCount} due to token limit]`;
    }

    return pageContext;
  } else if (pageData.html) {
    // For HTML, truncate to maxChars
    const truncatedHtml = pageData.html.substring(0, maxChars);
    return `Current page HTML (truncated to ${truncatedHtml.length} chars, original: ${pageData.html.length} chars):\n${truncatedHtml}\n`;
  } else {
    return 'No page information available';
  }
}

const SYSTEM_PROMPT = `You are a browser automation assistant. Your job is to analyze structured page information and user prompts to generate browser automation tasks.

Available task types:
1. navigate - Navigate to a URL
   params: { url: string }

2. click - Click an element
   params: { selector: string, waitForSelector?: string, timeout?: number }

3. fill - Fill an input field
   params: { selector: string, value: string, clearFirst?: boolean }

4. extract - Extract data from elements
   params: { selector: string, attribute?: string, extractText?: boolean }

5. wait - Wait for a duration
   params: { duration: number }

6. custom - Execute custom JavaScript
   params: { script: string, tabId?: number }

You will receive:
- User's original prompt/goal
- Current page information (structured JSON with interactive elements, selectors, types, labels)
- Conversation history (previous tasks and results)

Analyze the page information to understand:
- What interactive elements are available (buttons, inputs, links, etc.)
- Their selectors, types, and labels
- Current page state
- What needs to be done next to achieve the user's goal

Return your response as a JSON object with this exact format:
{
  "type": "navigate|click|fill|extract|wait|custom",
  "params": { ... },
  "reasoning": "Brief explanation of why you chose this task",
  "isComplete": false
}

Set "isComplete": true only when the user's goal has been fully achieved.
Set "isComplete": false to continue the task sequence.

Important:
- Use CSS selectors that are likely to be stable (IDs, data attributes, semantic selectors)
- Be specific with selectors to avoid clicking wrong elements
- Consider waiting for elements to appear if needed
- If the page information shows the goal is already achieved, set isComplete: true
- Use the selectors provided in the interactive elements list
- Match elements by their labels when possible for better accuracy

CRITICAL - Avoid Loops:
- ALWAYS review the "Previous Actions" section before generating a new task
- DO NOT repeat the same action (same task type + same selector) that was already performed
- If a previous action failed, try a different approach (different selector, different element, or different strategy)
- If you've already clicked/filled/extracted from an element, do NOT do it again unless the page state has clearly changed
- If you're stuck in a loop, try navigating to a different page or set isComplete: true if the goal cannot be achieved
- Track what you've already done: check selectors, URLs, and actions in the history before deciding the next step`;

export async function generateTask(prompt, pageData, conversationHistory = []) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured. Please set it in backend/.env file');
    }
    
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Build conversation context with detailed action history
    let context = `User's original goal: ${prompt}\n\n`;
    
    if (conversationHistory.length > 0) {
      context += 'Previous actions (REVIEW CAREFULLY TO AVOID LOOPS):\n';
      context += '='.repeat(60) + '\n';
      
      conversationHistory.forEach((entry, idx) => {
        const stepNum = idx + 1;
        context += `\nStep ${stepNum}:\n`;
        
        // Task information
        if (entry.task) {
          context += `  Action: ${entry.task.type.toUpperCase()}\n`;
          if (entry.task.params) {
            // Include key params that help identify what was done
            if (entry.task.params.selector) {
              context += `  Selector: "${entry.task.params.selector}"\n`;
            }
            if (entry.task.params.url) {
              context += `  URL: "${entry.task.params.url}"\n`;
            }
            if (entry.task.params.value) {
              context += `  Value: "${entry.task.params.value}"\n`;
            }
            if (entry.task.params.duration) {
              context += `  Duration: ${entry.task.params.duration}ms\n`;
            }
          }
        }
        
        // Reasoning/description of what was done
        if (entry.reasoning) {
          context += `  What I did: ${entry.reasoning}\n`;
        }
        
        // Result/outcome
        if (entry.result) {
          const resultStr = typeof entry.result === 'string' 
            ? entry.result 
            : JSON.stringify(entry.result);
          context += `  Result: ${resultStr.substring(0, 300)}${resultStr.length > 300 ? '...' : ''}\n`;
        } else if (entry.error) {
          context += `  Error: ${entry.error}\n`;
        } else {
          context += `  Status: pending\n`;
        }
        
        // Page state after action
        if (entry.pageInfo) {
          if (entry.pageInfo.url) {
            context += `  Page after action: ${entry.pageInfo.url}\n`;
          }
          if (entry.pageInfo.title) {
            context += `  Page title: ${entry.pageInfo.title}\n`;
          }
        }
        
        context += '\n';
      });
      
      context += '='.repeat(60) + '\n';
      context += '\nIMPORTANT: Before generating the next task, check if you have already:\n';
      context += '- Clicked the same selector\n';
      context += '- Filled the same input field\n';
      context += '- Navigated to the same URL\n';
      context += '- Extracted from the same element\n';
      context += 'If yes, try a DIFFERENT approach or mark the task as complete.\n\n';
    }

    // Format page data with token limit truncation
    let pageContext = truncatePageContext(pageData, MAX_CHARS_FOR_PAGE_CONTEXT);

    // Build full prompt
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${context}\n\n${pageContext}\n\nGenerate the next task as JSON:`;

    // Estimate and log token usage
    const estimatedTokens = estimateTokens(fullPrompt);
    const pageContextTokens = estimateTokens(pageContext);
    console.log(`[Gemini] Estimated tokens - Total: ${estimatedTokens.toLocaleString()}, Page context: ${pageContextTokens.toLocaleString()}, Max: ${MAX_TOKENS.toLocaleString()}`);
    
    if (estimatedTokens > MAX_TOKENS) {
      console.warn(`[Gemini] WARNING: Estimated tokens (${estimatedTokens.toLocaleString()}) exceed limit (${MAX_TOKENS.toLocaleString()})`);
    }

    console.log("Full Prompt:", fullPrompt.substring(0, 500) + (fullPrompt.length > 500 ? '... [truncated in log]' : ''));
    
    // Retry logic for valid JSON response
    const MAX_RETRIES = 5;
    let attempt = 0;
    let taskData = null;
    let lastError = null;

    while (attempt < MAX_RETRIES && !taskData) {
      attempt++;
      
      try {
        // Modify prompt on retry to emphasize valid JSON
        let currentPrompt = fullPrompt;
        if (attempt > 1) {
          currentPrompt = `${fullPrompt}\n\nIMPORTANT: You must respond with ONLY valid JSON. No explanations, no markdown, no code blocks. Just the raw JSON object. Previous attempt failed: ${lastError?.message || 'Invalid JSON format'}`;
          console.log(`[Gemini] Retry attempt ${attempt}/${MAX_RETRIES} - requesting valid JSON`);
        }

        const result = await model.generateContent(currentPrompt);
        const response = await result.response;
        const text = response.text();

        // Extract JSON from response - try multiple strategies
        let jsonMatch = text.match(/\{[\s\S]*\}/);
        
        // If no match, try to find JSON in code blocks
        if (!jsonMatch) {
          const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (codeBlockMatch) {
            jsonMatch = [codeBlockMatch[1]];
          }
        }

        if (!jsonMatch) {
          throw new Error('No JSON found in Gemini response');
        }

        // Try to parse the JSON
        let parsedJson;
        try {
          parsedJson = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
          throw new Error(`Invalid JSON format: ${parseError.message}`);
        }

        // Validate task structure
        if (!parsedJson.type || !parsedJson.params) {
          throw new Error(`Invalid task structure: missing 'type' or 'params' field. Got: ${JSON.stringify(Object.keys(parsedJson))}`);
        }

        // Validate task type
        const validTypes = ['navigate', 'click', 'fill', 'extract', 'wait', 'custom'];
        if (!validTypes.includes(parsedJson.type)) {
          throw new Error(`Invalid task type: ${parsedJson.type}. Must be one of: ${validTypes.join(', ')}`);
        }

        // Success - we have valid JSON
        taskData = parsedJson;
        if (attempt > 1) {
          console.log(`[Gemini] Successfully parsed JSON on attempt ${attempt}`);
        }
        
      } catch (error) {
        lastError = error;
        console.warn(`[Gemini] Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
        
        if (attempt >= MAX_RETRIES) {
          // Final attempt failed
          throw new Error(`Failed to get valid JSON after ${MAX_RETRIES} attempts. Last error: ${error.message}`);
        }
        
        // Wait a bit before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    if (!taskData) {
      throw new Error(`Failed to get valid JSON after ${MAX_RETRIES} attempts`);
    }

    return {
      type: taskData.type,
      params: taskData.params,
      reasoning: taskData.reasoning || 'No reasoning provided',
      isComplete: taskData.isComplete === true
    };
  } catch (error) {
    console.error('[Gemini] Error generating task:', error);
    throw new Error(`Failed to generate task: ${error.message}`);
  }
}

