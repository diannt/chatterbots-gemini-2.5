/**
 * GetStreamIntegration.js
 * 
 * Service for integrating GetStream with the character system,
 * implementing the "chaos_theory" architecture for character message routing
 */

const { StreamChat } = require('stream-chat');
const { Firestore } = require('@google-cloud/firestore');
const { CustomCharacterService } = require('./CustomCharacterService');
const { CharacterStateManager } = require('../managers/CharacterStateManager');
const { MetricsCalculationService } = require('./MetricsCalculationService');

/**
 * Service for integrating GetStream with the character system
 * Implements the "chaos_theory" architecture for message orchestration
 */
class GetStreamIntegration {
  /**
   * Create a new GetStream integration service
   * 
   * @param {Object} config - Configuration object
   * @param {string} config.apiKey - GetStream API key
   * @param {string} config.apiSecret - GetStream API secret
   * @param {string} config.projectId - Firestore project ID
   * @param {string} config.orchestratorId - ID of the orchestrator bot (chaos_theory)
   * @param {Function} config.handleMessage - Function to handle processed messages
   */
  constructor(config) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.projectId = config.projectId || 'your-project-id';
    this.orchestratorId = config.orchestratorId || 'chaos_theory';
    this.handleMessageCallback = config.handleMessage || this.defaultMessageHandler;
    
    // Initialize clients
    this.streamClient = new StreamChat(this.apiKey, this.apiSecret, {
      allowServerSideConnect: true
    });
    
    this.firestore = new Firestore({ projectId: this.projectId });
    
    // Initialize services
    this.characterService = new CustomCharacterService(config.geminiApiKey, this.projectId);
    this.stateManager = new CharacterStateManager(this.projectId);
    this.metricsService = new MetricsCalculationService(config.geminiApiKey, this.projectId);
    
    // Track active channels and mapped characters
    this.activeChannels = new Map();
    this.channelToCharacterMap = new Map();
    
    // Track processed message IDs to avoid duplicate processing
    this.processedMessageIds = new Set();
    
    // Bind methods to preserve 'this' context
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.handleIncomingMessage = this.handleIncomingMessage.bind(this);
    this.createCharacterChannel = this.createCharacterChannel.bind(this);
    this.parseChannelId = this.parseChannelId.bind(this);
    this.getCharacterForChannel = this.getCharacterForChannel.bind(this);
    this.sendMessageAsCharacter = this.sendMessageAsCharacter.bind(this);
  }
  
  /**
   * Connect to GetStream and set up event listeners
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      // Generate token for the orchestrator
      const token = this.streamClient.createToken(this.orchestratorId);
      
      // Connect as the orchestrator
      await this.streamClient.connectUser(
        { id: this.orchestratorId, name: 'Orchestrator' },
        token
      );
      
      console.log(`Connected to GetStream as orchestrator: ${this.orchestratorId}`);
      
      // Set up event listeners
      this.streamClient.on('message.new', this.handleIncomingMessage);
      this.streamClient.on('notification.added_to_channel', this.handleChannelAddition);
      
      // Load existing channels where the orchestrator is a member
      await this.loadExistingChannels();
      
      return true;
    } catch (error) {
      console.error('Error connecting to GetStream:', error);
      throw error;
    }
  }
  
  /**
   * Disconnect from GetStream
   * @returns {Promise<void>}
   */
  async disconnect() {
    try {
      // Remove event listeners
      this.streamClient.off('message.new', this.handleIncomingMessage);
      this.streamClient.off('notification.added_to_channel', this.handleChannelAddition);
      
      // Disconnect
      await this.streamClient.disconnectUser();
      console.log('Disconnected from GetStream');
      
      return true;
    } catch (error) {
      console.error('Error disconnecting from GetStream:', error);
      throw error;
    }
  }
  
  /**
   * Load existing channels where the orchestrator is a member
   * @returns {Promise<void>}
   */
  async loadExistingChannels() {
    try {
      const filter = { members: { $in: [this.orchestratorId] } };
      const sort = { created_at: -1 };
      const limit = 100;
      
      const channels = await this.streamClient.queryChannels(filter, sort, { limit });
      
      console.log(`Loaded ${channels.length} existing channels`);
      
      for (const channel of channels) {
        this.activeChannels.set(channel.id, channel);
        
        // Parse the channel ID to get the character ID
        const { characterId } = this.parseChannelId(channel.id);
        
        if (characterId) {
          this.channelToCharacterMap.set(channel.id, characterId);
        }
      }
      
      return channels;
    } catch (error) {
      console.error('Error loading existing channels:', error);
      throw error;
    }
  }
  
  /**
   * Handle incoming messages
   * @param {Object} event - The message event
   * @returns {Promise<void>}
   */
  async handleIncomingMessage(event) {
    try {
      // Skip processing if:
      // 1. There's no message
      // 2. The message has already been processed
      // 3. The message is from the orchestrator (prevents loops)
      if (
        !event.message || 
        this.processedMessageIds.has(event.message.id) ||
        event.message.user.id === this.orchestratorId
      ) {
        return;
      }
      
      // Mark the message as processed
      this.processedMessageIds.add(event.message.id);
      
      // Cleanup the processed messages set to prevent memory leaks
      // Keep only the 1000 most recent message IDs
      if (this.processedMessageIds.size > 1000) {
        const idsArray = Array.from(this.processedMessageIds);
        this.processedMessageIds = new Set(idsArray.slice(idsArray.length - 1000));
      }
      
      console.log(`Processing message: ${event.message.id} in channel: ${event.channel?.id || event.cid}`);
      
      // Get the channel ID
      const channelId = event.channel?.id || event.cid.split(':')[1];
      
      // Get the channel
      let channel = this.activeChannels.get(channelId);
      
      if (!channel) {
        // Try to get the channel from GetStream
        try {
          channel = this.streamClient.channel('messaging', channelId);
          await channel.watch();
          this.activeChannels.set(channelId, channel);
        } catch (error) {
          console.error(`Error getting channel ${channelId}:`, error);
          return;
        }
      }
      
      // Parse the channel ID to extract metadata
      const { userId, characterId, timestamp } = this.parseChannelId(channelId);
      
      // Check if this is a character channel
      if (!characterId) {
        console.log(`Not a character channel: ${channelId}`);
        return;
      }
      
      // Map the channel to the character if not already mapped
      if (!this.channelToCharacterMap.has(channelId)) {
        this.channelToCharacterMap.set(channelId, characterId);
      }
      
      // Process the message with the character service
      await this.processCharacterMessage(event.message, userId, channelId, characterId);
      
    } catch (error) {
      console.error('Error handling incoming message:', error);
    }
  }
  
  /**
   * Handle being added to a channel
   * @param {Object} event - The channel event
   * @returns {Promise<void>}
   */
  async handleChannelAddition(event) {
    try {
      console.log(`Added to channel: ${event.channel.id}`);
      
      // Get the channel
      const channel = this.streamClient.channel('messaging', event.channel.id);
      await channel.watch();
      
      // Store the channel
      this.activeChannels.set(channel.id, channel);
      
      // Parse the channel ID to extract metadata
      const { userId, characterId, timestamp } = this.parseChannelId(channel.id);
      
      // If this is a character channel, map it
      if (characterId) {
        this.channelToCharacterMap.set(channel.id, characterId);
        
        // Add the actual character to the channel (usually done by frontend in your design)
        // This is a server-side implementation for completeness
        await this.addCharacterToChannel(channel.id, characterId);
        
        // Send a welcome message from the character
        await this.sendWelcomeMessage(channel.id, userId, characterId);
      }
      
    } catch (error) {
      console.error('Error handling channel addition:', error);
    }
  }
  
  /**
   * Process a message with the character service
   * @param {Object} message - The message object
   * @param {string} userId - The user ID
   * @param {string} channelId - The channel ID
   * @param {string} characterId - The character ID
   * @returns {Promise<void>}
   */
  async processCharacterMessage(message, userId, channelId, characterId) {
    try {
      // Get the message text
      const messageText = message.text;
      
      if (!messageText || messageText.trim() === '') {
        console.log('Empty message, skipping processing');
        return;
      }
      
      console.log(`Processing message for character ${characterId}: ${messageText}`);
      
      // Get or load the character
      const character = await this.characterService.getCharacter(characterId);
      
      if (!character) {
        console.error(`Character ${characterId} not found`);
        return;
      }
      
      // Calculate user metrics based on the message
      const userActivities = [{
        type: 'conversation',
        text: messageText,
        timestamp: Date.now(),
        depth: this.calculateConversationDepth(messageText),
        reflection: this.calculateReflectionLevel(messageText)
      }];
      
      // Update metrics asynchronously - don't wait for completion
      this.metricsService.calculateUserMetrics(userId, userActivities).catch(console.error);
      
      // Generate a response from the character
      const response = await this.characterService.sendMessageToCharacter(
        characterId,
        messageText,
        { userId, channelId }
      );
      
      // Send the response back to the channel
      await this.sendMessageAsCharacter(channelId, characterId, response);
      
      // Store the interaction for future reference
      await this.storeInteraction(userId, characterId, messageText, response, channelId);
      
      // Call the message handler callback
      await this.handleMessageCallback(message, response, {
        userId,
        characterId,
        channelId
      });
      
    } catch (error) {
      console.error(`Error processing character message:`, error);
      
      // Send an error message to the channel
      await this.sendErrorMessage(channelId, characterId);
    }
  }
  
  /**
   * Create a new channel for a character
   * @param {string} userId - The user ID
   * @param {string} characterId - The character ID
   * @returns {Promise<Object>} - The created channel
   */
  async createCharacterChannel(userId, characterId) {
    try {
      // Get the character
      const character = await this.characterService.getCharacter(characterId);
      
      if (!character) {
        throw new Error(`Character ${characterId} not found`);
      }
      
      // Generate a unique channel ID
      const timestamp = Date.now();
      const channelId = `${userId}_${characterId}_${timestamp}`;
      
      // Create the channel
      const channel = this.streamClient.channel('messaging', channelId, {
        name: `Chat with ${character.name}`,
        members: [userId, this.orchestratorId],
        created_by: { id: this.orchestratorId },
      });
      
      // Create the channel on GetStream
      await channel.create();
      
      console.log(`Created channel ${channelId} for character ${characterId} and user ${userId}`);
      
      // Store the channel
      this.activeChannels.set(channelId, channel);
      this.channelToCharacterMap.set(channelId, characterId);
      
      // Add the actual character to the channel
      await this.addCharacterToChannel(channelId, characterId);
      
      // Send a welcome message
      await this.sendWelcomeMessage(channelId, userId, characterId);
      
      return channel;
    } catch (error) {
      console.error('Error creating character channel:', error);
      throw error;
    }
  }
  
  /**
   * Add a character to a channel
   * @param {string} channelId - The channel ID
   * @param {string} characterId - The character ID
   * @returns {Promise<boolean>} - Whether the character was added
   */
  async addCharacterToChannel(channelId, characterId) {
    try {
      // Get the character
      const character = await this.characterService.getCharacter(characterId);
      
      if (!character) {
        throw new Error(`Character ${characterId} not found`);
      }
      
      // Get the channel
      const channel = this.activeChannels.get(channelId) || this.streamClient.channel('messaging', channelId);
      
      // Add the character to the channel
      // Note: In a real implementation, you might want to create a real user for each character
      // For now, we'll just use the characterId as the user ID
      await channel.addMembers([characterId]);
      
      console.log(`Added character ${characterId} to channel ${channelId}`);
      
      return true;
    } catch (error) {
      console.error(`Error adding character ${characterId} to channel ${channelId}:`, error);
      return false;
    }
  }
  
  /**
   * Send a welcome message from a character
   * @param {string} channelId - The channel ID
   * @param {string} userId - The user ID
   * @param {string} characterId - The character ID
   * @returns {Promise<Object>} - The sent message
   */
  async sendWelcomeMessage(channelId, userId, characterId) {
    try {
      // Initialize the character session (triggers greeting)
      await this.characterService.initializeCharacterSession(characterId, { forceGreeting: true });
      
      // Get the character
      const character = await this.characterService.getCharacter(characterId);
      
      if (!character) {
        throw new Error(`Character ${characterId} not found`);
      }
      
      // Generate a welcome message
      const welcomeMessage = `Hello! I'm ${character.name}. How can I assist you today?`;
      
      // Send the message
      return await this.sendMessageAsCharacter(channelId, characterId, welcomeMessage);
    } catch (error) {
      console.error(`Error sending welcome message for character ${characterId}:`, error);
      throw error;
    }
  }
  
  /**
   * Send a message as a character
   * @param {string} channelId - The channel ID
   * @param {string} characterId - The character ID
   * @param {string} message - The message to send
   * @returns {Promise<Object>} - The sent message
   */
  async sendMessageAsCharacter(channelId, characterId, message) {
    try {
      // Get the character
      const character = await this.characterService.getCharacter(characterId);
      
      if (!character) {
        throw new Error(`Character ${characterId} not found`);
      }
      
      // Get the channel
      const channel = this.activeChannels.get(channelId) || this.streamClient.channel('messaging', channelId);
      
      // Send the message
      const response = await channel.sendMessage({
        text: message,
        user_id: characterId,
        mentioned_users: [],
        character_name: character.name
      });
      
      console.log(`Sent message as character ${characterId} in channel ${channelId}`);
      
      // Mark as processed to avoid recursive handling
      this.processedMessageIds.add(response.message.id);
      
      return response;
    } catch (error) {
      console.error(`Error sending message as character ${characterId}:`, error);
      throw error;
    }
  }
  
  /**
   * Send an error message
   * @param {string} channelId - The channel ID
   * @param {string} characterId - The character ID
   * @returns {Promise<Object>} - The sent message
   */
  async sendErrorMessage(channelId, characterId) {
    try {
      // Get the character name if possible
      let characterName = 'Character';
      try {
        const character = await this.characterService.getCharacter(characterId);
        if (character) {
          characterName = character.name;
        }
      } catch (e) {
        console.error('Error getting character for error message:', e);
      }
      
      // Get the channel
      const channel = this.activeChannels.get(channelId) || this.streamClient.channel('messaging', channelId);
      
      // Send an error message
      const errorMessage = `I'm sorry, ${characterName} is experiencing some technical difficulties. Please try again in a moment.`;
      
      const response = await channel.sendMessage({
        text: errorMessage,
        user_id: this.orchestratorId,
        mentioned_users: []
      });
      
      console.log(`Sent error message in channel ${channelId}`);
      
      // Mark as processed to avoid recursive handling
      this.processedMessageIds.add(response.message.id);
      
      return response;
    } catch (error) {
      console.error('Error sending error message:', error);
      return null;
    }
  }
  
  /**
   * Parse a channel ID to extract metadata
   * Format: userId_characterId_timestamp
   * 
   * @param {string} channelId - The channel ID
   * @returns {Object} - The parsed metadata
   */
  parseChannelId(channelId) {
    // Default return object
    const result = {
      userId: null,
      characterId: null,
      timestamp: null
    };
    
    // Check if the channel ID matches the expected format
    const parts = channelId.split('_');
    
    if (parts.length >= 3) {
      result.userId = parts[0];
      result.characterId = parts[1];
      result.timestamp = parseInt(parts[2], 10);
    }
    
    return result;
  }
  
  /**
   * Get the character ID associated with a channel
   * @param {string} channelId - The channel ID
   * @returns {string|null} - The character ID
   */
  getCharacterForChannel(channelId) {
    return this.channelToCharacterMap.get(channelId) || null;
  }
  
  /**
   * Store an interaction in Firestore
   * @param {string} userId - The user ID
   * @param {string} characterId - The character ID
   * @param {string} userMessage - The user's message
   * @param {string} characterResponse - The character's response
   * @param {string} channelId - The channel ID
   * @returns {Promise<boolean>} - Whether the interaction was stored
   */
  async storeInteraction(userId, characterId, userMessage, characterResponse, channelId) {
    try {
      // Create the interaction object
      const interaction = {
        userId,
        characterId,
        userMessage,
        characterResponse,
        channelId,
        timestamp: Date.now()
      };
      
      // Store in Firestore
      await this.firestore.collection('interactions').add(interaction);
      
      return true;
    } catch (error) {
      console.error('Error storing interaction:', error);
      return false;
    }
  }
  
  /**
   * Default message handler
   * @param {Object} message - The original message
   * @param {string} response - The character's response
   * @param {Object} metadata - Additional metadata
   */
  defaultMessageHandler(message, response, metadata) {
    console.log(`Message processed: ${message.text}`);
    console.log(`Character ${metadata.characterId} responded: ${response}`);
  }
  
  /**
   * Calculate the depth of a conversation
   * This would be a more sophisticated algorithm in a real implementation
   * @param {string} text - The message text
   * @returns {number} - The conversation depth (0-10)
   */
  calculateConversationDepth(text) {
    // Simple example - length and complexity
    const wordCount = text.split(/\s+/).length;
    const complexWords = text.split(/\s+/).filter(word => word.length > 7).length;
    
    return Math.min(10, (wordCount / 20) + (complexWords / 2));
  }
  
  /**
   * Calculate the reflection level in a message
   * This would be a more sophisticated algorithm in a real implementation
   * @param {string} text - The message text
   * @returns {number} - The reflection level (0-10)
   */
  calculateReflectionLevel(text) {
    // Simple example - presence of reflective phrases
    const reflectiveWords = ['think', 'feel', 'believe', 'wonder', 'reflect', 'consider'];
    const reflectiveCount = reflectiveWords.reduce((count, word) => {
      return count + (text.toLowerCase().includes(word) ? 1 : 0);
    }, 0);
    
    return Math.min(10, reflectiveCount * 2);
  }
}

module.exports = GetStreamIntegration;