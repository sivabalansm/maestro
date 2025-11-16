import * as chrono from 'chrono-node';

/**
 * Extract scheduling information from a natural language prompt
 * @param {string} prompt - The user's prompt that may contain scheduling information
 * @returns {Object} - { cleanPrompt: string, scheduledAt: Date|null }
 */
export function extractSchedulingInfo(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { cleanPrompt: prompt, scheduledAt: null };
  }

  // Try to parse date/time from the prompt using chrono-node
  const parsedDate = chrono.parseDate(prompt);
  
  if (!parsedDate) {
    // No scheduling info found
    return { cleanPrompt: prompt.trim(), scheduledAt: null };
  }

  // Check if the parsed date is in the future
  const now = new Date();
  if (parsedDate <= now) {
    // Date is in the past, don't schedule
    return { cleanPrompt: prompt.trim(), scheduledAt: null };
  }

  // Extract the scheduling phrase to remove it from the prompt
  const results = chrono.parse(prompt);
  let cleanPrompt = prompt;
  
  if (results.length > 0) {
    const firstResult = results[0];
    // Remove the scheduling phrase from the prompt
    const before = prompt.substring(0, firstResult.index).trim();
    const after = prompt.substring(firstResult.index + firstResult.text.length).trim();
    cleanPrompt = `${before} ${after}`.trim();
    
    // If cleanPrompt is empty or too short, keep original prompt
    if (cleanPrompt.length < 3) {
      cleanPrompt = prompt.trim();
    }
  }

  return {
    cleanPrompt: cleanPrompt || prompt.trim(),
    scheduledAt: parsedDate.toISOString()
  };
}

/**
 * Check if a prompt contains scheduling keywords
 * @param {string} prompt - The user's prompt
 * @returns {boolean} - True if prompt likely contains scheduling info
 */
export function hasSchedulingKeywords(prompt) {
  if (!prompt) return false;
  
  const schedulingKeywords = [
    'tomorrow', 'today', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'next week', 'next month', 'in an hour', 'in 2 hours', 'at 3pm', 'at 9am', 'at noon', 'at midnight',
    'schedule', 'later', 'tonight', 'this evening', 'this afternoon', 'this morning',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'
  ];
  
  const lowerPrompt = prompt.toLowerCase();
  return schedulingKeywords.some(keyword => lowerPrompt.includes(keyword));
}

