document.addEventListener('DOMContentLoaded', () => {
  const chatWidget = document.getElementById('chat-widget');
  const startChatButton = document.getElementById('start-chat');
  const closeChatButton = document.getElementById('close-chat');
  const chatMessages = document.getElementById('chat-messages');
  const userInput = document.getElementById('user-input');
  const sendMessageButton = document.getElementById('send-message');
  
  // Show chat widget when start button is clicked
  startChatButton.addEventListener('click', () => {
    chatWidget.classList.add('active');
  });
  
  // Hide chat widget when close button is clicked
  closeChatButton.addEventListener('click', () => {
    chatWidget.classList.remove('active');
  });
  
  // Send message when send button is clicked or Enter key is pressed
  const sendMessage = async () => {
    const message = userInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addMessage(message, 'user');
    userInput.value = '';
    
    try {
      // Send message to backend
      const response = await fetch('/api/eco/tips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: message })
      });
      
      const data = await response.json();
      
      // Add bot response to chat
      if (data.tips && data.tips.length > 0) {
        // Add tips
        data.tips.forEach(tip => {
          addMessage(tip, 'bot');
        });
        
        // Add product recommendation if available
        if (data.product) {
          addMessage(`Product Recommendation: ${data.product}`, 'bot');
        }
        
        // Add CO2 impact if available
        if (data.co2Impact) {
          addMessage(`Estimated CO2 Impact: ${data.co2Impact} kg`, 'bot');
        }
      } else {
        addMessage('Sorry, I couldn\'t generate tips for that query. Please try again.', 'bot');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      addMessage('Sorry, there was an error processing your request. Please try again.', 'bot');
    }
  };
  
  sendMessageButton.addEventListener('click', sendMessage);
  
  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  // Helper function to add a message to the chat
  function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    
    messageDiv.appendChild(paragraph);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Load product recommendations on page load
  const loadProductRecommendations = async () => {
    try {
      const response = await fetch('/api/eco/products');
      const products = await response.json();
      
      // You could display these products somewhere on the page
      console.log('Product recommendations:', products);
    } catch (error) {
      console.error('Error loading product recommendations:', error);
    }
  };
  
  // Uncomment to load product recommendations on page load
  // loadProductRecommendations();
}); 