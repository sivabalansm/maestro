// Example: Create a test task
// Run with: node example-task.js

import axios from 'axios';

const API_URL = 'http://localhost:3001';

async function createExampleTask() {
  try {
    const task = {
      type: 'navigate',
      params: {
        url: 'https://google.com'
      },
      extensionId: 'ext_demo',
      userId: 'anonymous'
    };

    console.log('Creating task:', task);
    const response = await axios.post(`${API_URL}/api/tasks/create`, task);
    console.log('Task created:', response.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

createExampleTask();

