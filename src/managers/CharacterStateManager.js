/**
 * CharacterStateManager.js
 *
 * Manages persistent state for AI characters to fix assignment and identity issues
 */

const { Firestore } = require('@google-cloud/firestore');

/**
 * Manager for handling AI character state persistence
 * Addresses issues with group assignment and character identity
 */
class CharacterStateManager {
  constructor(projectId = 'your-project-id') {
    this.firestore = new Firestore({ projectId });
    this.stateCache = new Map();
    this.conversationFlags = new Map();
  }
  
  /**
   * Initialize a character's state
   * 
   * @param {string} characterId - The character's ID
   * @param {Object} initialState - The initial state
   */
  async initializeCharacter(characterId, initialState = {}) {
    try {
      // Get existing state or create new state
      const existingState = await this.getCharacterState(characterId);
      
      if (!existingState) {
        // Set default state fields if not provided
        const defaultState = {
          group: null,
          name: initialState.name || 'Character',
          traits: initialState.traits || [],
          greetingCompleted: false,
          identityEstablished: false,
          lastInteraction: Date.now(),
          interactionCount: 0,
          created: Date.now(),
          ...initialState
        };
        
        // Store in Firestore
        await this.firestore.collection('character_states').doc(characterId).set(defaultState);
        
        // Cache the state
        this.stateCache.set(characterId, defaultState);
        console.log(`Initialized character ${characterId}`);
        
        return defaultState;
      }
      
      return existingState;
    } catch (error) {
      console.error(`Error initializing character ${characterId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get a character's state from cache or database
   * 
   * @param {string} characterId - The character's ID
   * @returns {Object} - The character's state
   */
  async getCharacterState(characterId) {
    try {
      // Check cache first
      if (this.stateCache.has(characterId)) {
        return this.stateCache.get(characterId);
      }
      
      // Retrieve from Firestore
      const doc = await this.firestore.collection('character_states').doc(characterId).get();
      
      if (!doc.exists) {
        return null;
      }
      
      const state = doc.data();
      
      // Cache the state
      this.stateCache.set(characterId, state);
      
      return state;
    } catch (error) {
      console.error(`Error getting character state for ${characterId}:`, error);
      return null;
    }
  }
  
  /**
   * Update a character's group assignment
   * Includes complete context reset to fix persistence issues
   * 
   * @param {string} characterId - The character's ID
   * @param {string} groupId - The group ID
   * @returns {Object} - The updated state
   */
  async updateGroup(characterId, groupId) {
    try {
      // Get the current state
      const state = await this.getCharacterState(characterId);
      
      if (!state) {
        throw new Error(`Character ${characterId} not found`);
      }
      
      // Check if this is a group change
      const isGroupChange = state.group !== groupId;
      
      // Update the state
      const updatedState = {
        ...state,
        group: groupId,
        lastGroupChange: isGroupChange ? Date.now() : state.lastGroupChange,
        // Reset certain flags if group changes to force proper context updates
        identityEstablished: isGroupChange ? false : state.identityEstablished,
        contextReset: isGroupChange ? Date.now() : state.contextReset,
        lastUpdated: Date.now()
      };
      
      // Update Firestore
      await this.firestore.collection('character_states').doc(characterId).set(updatedState, { merge: true });
      
      // Update cache
      this.stateCache.set(characterId, updatedState);
      
      // Add special flag for conversation reset if group changed
      if (isGroupChange) {
        this.setConversationFlag(characterId, 'resetRequired', true);
      }
      
      console.log(`Updated group for character ${characterId} to ${groupId}`);
      
      return updatedState;
    } catch (error) {
      console.error(`Error updating group for character ${characterId}:`, error);
      throw error;
    }
  }
  
  /**
   * Mark that a greeting has been completed
   * 
   * @param {string} characterId - The character's ID
   * @returns {Object} - The updated state
   */
  async markGreetingCompleted(characterId) {
    try {
      const state = await this.getCharacterState(characterId);
      
      if (!state) {
        throw new Error(`Character ${characterId} not found`);
      }
      
      // Update the state
      const updatedState = {
        ...state,
        greetingCompleted: true,
        lastUpdated: Date.now()
      };
      
      // Update Firestore
      await this.firestore.collection('character_states').doc(characterId).update({
        greetingCompleted: true,
        lastUpdated: Date.now()
      });
      
      // Update cache
      this.stateCache.set(characterId, updatedState);
      
      return updatedState;
    } catch (error) {
      console.error(`Error marking greeting completed for character ${characterId}:`, error);
      throw error;
    }
  }
  
  /**
   * Mark that character identity has been established
   * 
   * @param {string} characterId - The character's ID
   * @returns {Object} - The updated state
   */
  async markIdentityEstablished(characterId) {
    try {
      const state = await this.getCharacterState(characterId);
      
      if (!state) {
        throw new Error(`Character ${characterId} not found`);
      }
      
      // Update the state
      const updatedState = {
        ...state,
        identityEstablished: true,
        lastUpdated: Date.now()
      };
      
      // Update Firestore
      await this.firestore.collection('character_states').doc(characterId).update({
        identityEstablished: true,
        lastUpdated: Date.now()
      });
      
      // Update cache
      this.stateCache.set(characterId, updatedState);
      
      return updatedState;
    } catch (error) {
      console.error(`Error marking identity established for character ${characterId}:`, error);
      throw error;
    }
  }
  
  /**
   * Log an interaction with the character
   * 
   * @param {string} characterId - The character's ID
   * @param {Object} interaction - The interaction details
   */
  async logInteraction(characterId, interaction) {
    try {
      const state = await this.getCharacterState(characterId);
      
      if (!state) {
        throw new Error(`Character ${characterId} not found`);
      }
      
      // Update interaction count and timestamp
      const updatedState = {
        ...state,
        interactionCount: (state.interactionCount || 0) + 1,
        lastInteraction: Date.now(),
        lastUpdated: Date.now()
      };
      
      // Log the interaction
      await this.firestore.collection('character_interactions').add({
        characterId,
        timestamp: Date.now(),
        ...interaction
      });
      
      // Update state
      await this.firestore.collection('character_states').doc(characterId).update({
        interactionCount: updatedState.interactionCount,
        lastInteraction: updatedState.lastInteraction,
        lastUpdated: updatedState.lastUpdated
      });
      
      // Update cache
      this.stateCache.set(characterId, updatedState);
    } catch (error) {
      console.error(`Error logging interaction for character ${characterId}:`, error);
    }
  }
  
  /**
   * Set a temporary conversation flag (not persisted to database)
   * 
   * @param {string} characterId - The character's ID 
   * @param {string} flag - The flag name
   * @param {any} value - The flag value
   */
  setConversationFlag(characterId, flag, value) {
    if (!this.conversationFlags.has(characterId)) {
      this.conversationFlags.set(characterId, new Map());
    }
    
    this.conversationFlags.get(characterId).set(flag, value);
  }
  
  /**
   * Get a conversation flag
   * 
   * @param {string} characterId - The character's ID
   * @param {string} flag - The flag name 
   * @returns {any} - The flag value
   */
  getConversationFlag(characterId, flag) {
    if (!this.conversationFlags.has(characterId)) {
      return undefined;
    }
    
    return this.conversationFlags.get(characterId).get(flag);
  }
  
  /**
   * Clear a conversation flag
   * 
   * @param {string} characterId - The character's ID
   * @param {string} flag - The flag to clear
   */
  clearConversationFlag(characterId, flag) {
    if (this.conversationFlags.has(characterId)) {
      this.conversationFlags.get(characterId).delete(flag);
    }
  }
  
  /**
   * Generate system instruction modifications based on character state
   * 
   * @param {string} characterId - The character's ID
   * @param {string} baseInstructions - The base system instructions
   */
  async getEnhancedSystemInstructions(characterId, baseInstructions) {
    const state = await this.getCharacterState(characterId);
    
    if (!state) {
      return baseInstructions;
    }
    
    let enhancedInstructions = baseInstructions;
    
    // Add group context if assigned
    if (state.group) {
      enhancedInstructions += `\n\nIMPORTANT: You are a member of the ${state.group}. This is a permanent part of your identity.`;
    }
    
    // Add identity established instruction if needed
    if (state.identityEstablished) {
      enhancedInstructions += `\n\nIMPORTANT: You have already introduced yourself to the user. Do not reintroduce yourself in each message. Continue the conversation naturally as if your identity is already established and known to the user.`;
    }
    
    // Add greeting instruction if not yet completed
    if (!state.greetingCompleted) {
      enhancedInstructions += `\n\nIMPORTANT: This is your first interaction with this user. Start with a warm greeting that introduces yourself and establishes your character.`;
    }
    
    // Add group change context if needed
    if (this.getConversationFlag(characterId, 'resetRequired')) {
      enhancedInstructions += `\n\nCRITICAL: You have just become a member of the ${state.group}. This is now a permanent part of your identity. Do not reference any previous group affiliations.`;
      
      // Clear the flag since we've handled it
      this.clearConversationFlag(characterId, 'resetRequired');
    }
    
    return enhancedInstructions;
  }
}

module.exports = CharacterStateManager;