import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
- Match elements by their labels when possible for better accuracy`;

export async function generateTask(prompt, pageData, conversationHistory = []) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Build conversation context
    let context = `User's original goal: ${prompt}\n\n`;
    
    if (conversationHistory.length > 0) {
      context += 'Previous actions:\n';
      conversationHistory.forEach((entry, idx) => {
        context += `${idx + 1}. Task: ${entry.task?.type || 'unknown'}\n`;
        context += `   Result: ${entry.result ? JSON.stringify(entry.result).substring(0, 200) : 'pending'}\n`;
      });
      context += '\n';
    }

    // Format page data - use structured format if available, otherwise fallback to HTML
    let pageContext = '';
    if (pageData.interactiveElements) {
      // New structured format
      pageContext = `Current page information:
URL: ${pageData.url}
Title: ${pageData.title}
${pageData.description ? `Description: ${pageData.description}\n` : ''}
${pageData.headings && pageData.headings.length > 0 ? `Headings:\n${pageData.headings.map(h => `  ${'#'.repeat(h.level)} ${h.text}`).join('\n')}\n` : ''}
Interactive elements (${pageData.interactiveElements.length} total):
${pageData.interactiveElements.map((el, idx) => 
  `${idx + 1}. ${el.type} - Selector: "${el.selector}"${el.label ? ` - Label: "${el.label}"` : ''}${el.value ? ` - Value: "${el.value}"` : ''}`
).join('\n')}`;
    } else if (pageData.html) {
      // Fallback to HTML (truncated)
      pageContext = `Current page HTML (truncated):\n${pageData.html.substring(0, 20000)}\n`;
    } else {
      pageContext = 'No page information available';
    }

    const fullPrompt = `${SYSTEM_PROMPT}\n\n${context}\n\n${pageContext}\n\nGenerate the next task as JSON:`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const taskData = JSON.parse(jsonMatch[0]);

    // Validate task structure
    if (!taskData.type || !taskData.params) {
      throw new Error('Invalid task structure from Gemini');
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

