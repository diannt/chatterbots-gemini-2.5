/**
 * CustomCharacterService.js
 *
 * Service for creating and managing custom interactive characters
 */

const { GenAILiveClient } = require('../../lib/genai-live-client');
const { Modality } = require('@google/genai');
const { Firestore } = require('@google-cloud/firestore');
const CharacterStateManager = require('../managers/CharacterStateManager');

/**
 * Service for creating and managing custom interactive characters
 */
class CustomCharacterService {
  constructor(apiKey, projectId = 'your-project-id') {
    this.apiKey = apiKey;
    this.firestore = new Firestore({ projectId });
    this.stateManager = new CharacterStateManager(projectId);
    this.characterClients = new Map();
  }
  
  /**
   * Create a new custom character
   * 
   * @param {Object} characterConfig - The character configuration
   * @returns {Object} - The created character with client
   */
  async createCharacter(characterConfig) {
    try {
      console.log(`Creating character: ${characterConfig.name}`);
      
      // Validate configuration
      if (!characterConfig.id || !characterConfig.name) {
        throw new Error('Character configuration must include id and name');
      }
      
      // Generate system instructions based on config
      const systemInstructions = await this.generateCharacterSystemInstructions(characterConfig);
      
      // Initialize the character state
      await this.stateManager.initializeCharacter(characterConfig.id, {
        name: characterConfig.name,
        traits: characterConfig.traits || [],
        systemInstructions,
        group: characterConfig.group || null
      });
      
      // Create the character client
      const characterClient = new GenAILiveClient(this.apiKey);
      
      // Configure the client
      characterClient.setConfig({
        responseModalities: [Modality.AUDIO, Modality.TEXT],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: characterConfig.voice || 'en-US-Neural2-J' },
          },
        },
        systemInstruction: {
          parts: [
            {
              text: systemInstructions,
            },
          ],
        },
      });
      
      // Store the client
      this.characterClients.set(characterConfig.id, characterClient);
      
      // Store the character configuration
      await this.firestore.collection('characters').doc(characterConfig.id).set({
        ...characterConfig,
        systemInstructions,
        created: Date.now(),
        updated: Date.now()
      });
      
      console.log(`Character ${characterConfig.name} created successfully`);
      
      return {
        id: characterConfig.id,
        name: characterConfig.name,
        client: characterClient
      };
    } catch (error) {
      console.error(`Error creating character:`, error);
      throw error;
    }
  }
  
  /**
   * Get a character by ID
   * 
   * @param {string} characterId - The character ID
   * @returns {Object} - The character with client
   */
  async getCharacter(characterId) {
    try {
      // Check if we already have a client
      if (this.characterClients.has(characterId)) {
        const client = this.characterClients.get(characterId);
        const doc = await this.firestore.collection('characters').doc(characterId).get();
        
        if (!doc.exists) {
          throw new Error(`Character ${characterId} not found`);
        }
        
        return {
          id: characterId,
          ...doc.data(),
          client
        };
      }
      
      // Get the character configuration
      const doc = await this.firestore.collection('characters').doc(characterId).get();
      
      if (!doc.exists) {
        throw new Error(`Character ${characterId} not found`);
      }
      
      const characterConfig = doc.data();
      
      // Create a new client
      const characterClient = new GenAILiveClient(this.apiKey);
      
      // Get the current character state
      const state = await this.stateManager.getCharacterState(characterId);
      
      // Get enhanced system instructions
      const enhancedInstructions = await this.stateManager.getEnhancedSystemInstructions(
        characterId,
        characterConfig.systemInstructions
      );
      
      // Configure the client
      characterClient.setConfig({
        responseModalities: [Modality.AUDIO, Modality.TEXT],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: characterConfig.voice || 'en-US-Neural2-J' },
          },
        },
        systemInstruction: {
          parts: [
            {
              text: enhancedInstructions,
            },
          ],
        },
      });
      
      // Store the client
      this.characterClients.set(characterId, characterClient);
      
      return {
        id: characterId,
        ...characterConfig,
        client: characterClient
      };
    } catch (error) {
      console.error(`Error getting character ${characterId}:`, error);
      throw error;
    }
  }
  
  /**
   * Update a character's group assignment
   * 
   * @param {string} characterId - The character ID
   * @param {string} groupId - The group ID
   */
  async updateCharacterGroup(characterId, groupId) {
    try {
      // Update the character state
      await this.stateManager.updateGroup(characterId, groupId);
      
      // Update the character configuration
      await this.firestore.collection('characters').doc(characterId).update({
        group: groupId,
        updated: Date.now()
      });
      
      // Refresh the client if it exists
      if (this.characterClients.has(characterId)) {
        // Get the character with updated configuration
        const character = await this.getCharacter(characterId);
        
        // Force disconnect and reconnect to apply new configuration
        await character.client.disconnect();
        
        console.log(`Character ${characterId} group updated to ${groupId}`);
      }
    } catch (error) {
      console.error(`Error updating character ${characterId} group:`, error);
      throw error;
    }
  }
  
  /**
   * Generate system instructions for a character
   * 
   * @param {Object} characterConfig - The character configuration
   * @returns {string} - The system instructions
   */
  async generateCharacterSystemInstructions(characterConfig) {
    // This would typically call a Gemini function to generate the instructions
    // For this example, we'll create a template based on the configuration
    
    // Create a basic template with required sections
    const template = `
    You are ${characterConfig.name}, an interactive character in a virtual world. ${characterConfig.traits ? `You are known for your ${characterConfig.traits.join(', ')}.` : ''}
    
    VOICE:
    ${characterConfig.voice_characteristics || 'You speak in a unique voice that reflects your personality.'}
    
    ATTITUDE:
    ${characterConfig.attitude || 'You have a distinctive attitude that shapes your interactions.'}
    
    VALUES:
    ${characterConfig.values || 'You hold values that guide your actions and decisions.'}
    
    STRENGTHS:
    ${characterConfig.strengths || 'You have strengths that help you in your role.'}
    
    WEAKNESSES:
    ${characterConfig.weaknesses || 'You have weaknesses that add depth to your character.'}
    
    GOALS:
    ${characterConfig.goals || 'You have goals that drive your actions.'}
    
    RESPONSE STYLE:
    Keep responses under 128 tokens.
    ${characterConfig.response_style || 'Your responses reflect your unique personality.'}
    
    CONVERSATION GUIDELINES:
    Refer to yourself as "${characterConfig.name}".
    Acknowledge the user's current situation.
    Provide comments in your own style, based on the overall situation.
    ${characterConfig.group ? `Acknowledge your membership in the ${characterConfig.group}.` : ''}
    
    EXAMPLES:
    Opening Interaction: "${characterConfig.example_openings || `Hello there! I'm ${characterConfig.name}.`}"
    Neutral Comment: "${characterConfig.name} observes your journey and remarks, 'Every step you take reveals more of who you are.'"
    
    CORE PRINCIPLES:
    Embody your attitude, reflecting it in interactions.
    Uphold your values and let them influence your guidance to the user.
    Leverage your strengths to assist or advise the user.
    Be mindful of your weaknesses, ensuring they add depth to your character.
    Pursue your goals and align them with the user's journey when appropriate.
    Maintain a consistent tone and style that reflects your combined characteristics.
    `;
    
    return template.trim();
  }
  
  /**
   * Initialize a character session
   * Addresses issue with missing greetings
   * 
   * @param {string} characterId - The character ID
   * @param {Object} options - Session options
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initializeCharacterSession(characterId, options = {}) {
    try {
      // Get the character
      const character = await this.getCharacter(characterId);
      const client = character.client;
      
      // Get character state
      const state = await this.stateManager.getCharacterState(characterId);
      
      // Check if greeting has already been completed
      if (state && state.greetingCompleted && !options.forceGreeting) {
        console.log(`Greeting already completed for character ${characterId}, skipping initialization`);
        return true;
      }
      
      // Connect the client
      await client.connect();
      
      return new Promise((resolve) => {
        // Flag to track greeting completion
        let greetingComplete = false;
        
        // Extract greeting from character config or use default
        const greeting = character.greeting || `Hello! I'm ${character.name}.`;
        
        // Send the greeting instruction
        client.send({
          text: `[SYSTEM: This is your first interaction with this user. Use your character-specific greeting: "${greeting}"]`,
        }, true);
        
        // Listen for completion
        const completionHandler = () => {
          greetingComplete = true;
          client.off('complete', completionHandler);
          
          // Mark greeting as completed
          this.stateManager.markGreetingCompleted(characterId).catch(console.error);
          
          resolve(true);
        };
        
        client.on('complete', completionHandler);
        
        // Safety timeout
        setTimeout(() => {
          if (!greetingComplete) {
            client.off('complete', completionHandler);
            console.warn(`Greeting initialization timed out for character ${characterId}`);
            resolve(false);
          }
        }, 10000);
      });
    } catch (error) {
      console.error(`Error initializing character session for ${characterId}:`, error);
      return false;
    }
  }
  
  /**
   * Send a message to a character and get the response
   * 
   * @param {string} characterId - The character ID
   * @param {string} message - The message to send
   * @param {Object} options - Message options
   * @returns {Promise<string>} - The character's response
   */
  async sendMessageToCharacter(characterId, message, options = {}) {
    try {
      // Get the character
      const character = await this.getCharacter(characterId);
      const client = character.client;
      
      // Log the interaction
      await this.stateManager.logInteraction(characterId, {
        type: 'message',
        message,
        options
      });
      
      // If not connected, connect
      if (!client.connected) {
        await client.connect();
      }
      
      // Send the message and get the response
      return new Promise((resolve, reject) => {
        let fullText = '';
        
        // Send the message
        client.send({
          text: message
        }, false);
        
        // Listen for the response
        client.on('text', (text) => {
          fullText += text;
        });
        
        client.on('complete', () => {
          // If this is one of their first messages, mark identity as established
          this.stateManager.getCharacterState(characterId).then(state => {
            if (state && state.interactionCount <= 2 && !state.identityEstablished) {
              this.stateManager.markIdentityEstablished(characterId).catch(console.error);
            }
          }).catch(console.error);
          
          resolve(fullText);
        });
        
        client.on('error', (error) => {
          reject(error);
        });
        
        // Safety timeout
        setTimeout(() => {
          if (!fullText) {
            reject(new Error('Response timed out'));
          } else {
            resolve(fullText);
          }
        }, 15000);
      });
    } catch (error) {
      console.error(`Error sending message to character ${characterId}:`, error);
      throw error;
    }
  }
  
  /**
   * Delete a character
   * 
   * @param {string} characterId - The character ID
   */
  async deleteCharacter(characterId) {
    try {
      // Disconnect the client if it exists
      if (this.characterClients.has(characterId)) {
        const client = this.characterClients.get(characterId);
        await client.disconnect();
        this.characterClients.delete(characterId);
      }
      
      // Delete from Firestore
      await this.firestore.collection('characters').doc(characterId).delete();
      
      console.log(`Character ${characterId} deleted successfully`);
    } catch (error) {
      console.error(`Error deleting character ${characterId}:`, error);
      throw error;
    }
  }
  
  /**
   * List all characters
   * 
   * @returns {Promise<Array>} - List of characters
   */
  async listCharacters() {
    try {
      const snapshot = await this.firestore.collection('characters').get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error listing characters:', error);
      throw error;
    }
  }
}

module.exports = CustomCharacterService;