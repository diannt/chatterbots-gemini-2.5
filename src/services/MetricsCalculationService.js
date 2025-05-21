/**
 * MetricsCalculationService.js
 *
 * Service for calculating, storing, and transmitting user metrics to the appropriate character
 */

const { Firestore } = require('@google-cloud/firestore');
const { GenAILiveClient } = require('../../lib/genai-live-client');
const { Modality } = require('@google/genai');

// Configuration for characters by affinity group
const CHARACTER_GROUPS = {
  'group-alpha': {
    id: 'alpha',
    name: 'Verdant',
    voice: 'en-US-Neural2-D',
    color: 'green'
  },
  'group-beta': {
    id: 'beta',
    name: 'Azure',
    voice: 'en-US-Neural2-F',
    color: 'blue'
  },
  'group-gamma': {
    id: 'gamma',
    name: 'Crimson',
    voice: 'en-US-Neural2-G',
    color: 'red'
  },
  'group-delta': {
    id: 'delta',
    name: 'Lunar',
    voice: 'en-US-Neural2-C',
    color: 'white'
  },
  'group-epsilon': {
    id: 'epsilon',
    name: 'Solar',
    voice: 'en-US-Neural2-A',
    color: 'yellow'
  }
};

/**
 * Service for managing metrics calculations and character insights
 */
class MetricsCalculationService {
  constructor(apiKey, projectId = 'your-project-id') {
    this.apiKey = apiKey;
    this.firestore = new Firestore({ projectId });
    this.characterClients = {};
    
    // Initialize character clients for each group
    Object.keys(CHARACTER_GROUPS).forEach(groupId => {
      this.characterClients[groupId] = new GenAILiveClient(apiKey);
    });
  }

  /**
   * Calculate metrics for a user based on their activities and interactions
   * 
   * @param {string} userId - The user's ID
   * @param {Object} userActivities - Recent user activities to analyze
   * @returns {Object} - The calculated metrics
   */
  async calculateUserMetrics(userId, userActivities) {
    console.log(`Calculating metrics for user ${userId}`);
    
    // Get the user's previous metrics for context
    const previousMetrics = await this.getUserMetrics(userId);
    
    // Define the baseline metrics structure
    const metrics = {
      timestamp: Date.now(),
      userId,
      categories: {
        alpha: 0,   // Green Group
        beta: 0,    // Blue Group
        gamma: 0,   // Red Group
        delta: 0,   // White Group
        epsilon: 0  // Yellow Group
      },
      // Add any previous data points for continuity
      history: previousMetrics ? [...(previousMetrics.history || []), previousMetrics] : []
    };
    
    // Process each activity to update metrics
    userActivities.forEach(activity => {
      // Logic to analyze activities and adjust metrics values
      // This is a simplified placeholder - real logic would be more complex
      switch (activity.type) {
        case 'conversation':
          // Analyze conversation topics and sentiment
          metrics.categories.beta += activity.depth * 0.5;
          metrics.categories.delta += activity.reflection * 0.7;
          break;
          
        case 'challenge':
          // Analyze how they approached challenges
          metrics.categories.alpha += activity.persistence * 0.8;
          metrics.categories.gamma += activity.creativity * 0.6;
          break;
          
        case 'sharing':
          // Analyze generosity and expressiveness
          metrics.categories.epsilon += activity.generosity * 0.9;
          break;
          
        // Additional activity types would be processed here
      }
    });
    
    // Normalize the values to ensure they're within expected ranges
    Object.keys(metrics.categories).forEach(category => {
      metrics.categories[category] = Math.min(Math.max(metrics.categories[category], 0), 10);
    });
    
    // Determine the user's primary group based on highest score
    metrics.primaryGroup = Object.keys(metrics.categories).reduce(
      (max, category) => metrics.categories[category] > metrics.categories[max] ? category : max, 
      Object.keys(metrics.categories)[0]
    );
    
    // Store the calculated metrics
    await this.storeMetrics(userId, metrics);
    
    return metrics;
  }
  
  /**
   * Store metrics for a user in the database
   * 
   * @param {string} userId - The user's ID
   * @param {Object} metrics - The metrics to store
   */
  async storeMetrics(userId, metrics) {
    try {
      await this.firestore.collection('user_metrics').doc(userId).set(metrics);
      console.log(`Stored metrics for user ${userId}`);
    } catch (error) {
      console.error(`Error storing metrics for user ${userId}:`, error);
      throw error;
    }
  }
  
  /**
   * Retrieve the most recent metrics for a user
   * 
   * @param {string} userId - The user's ID
   * @returns {Object|null} - The user's metrics or null if not found
   */
  async getUserMetrics(userId) {
    try {
      const doc = await this.firestore.collection('user_metrics').doc(userId).get();
      if (doc.exists) {
        return doc.data();
      }
      return null;
    } catch (error) {
      console.error(`Error retrieving metrics for user ${userId}:`, error);
      return null;
    }
  }
  
  /**
   * Get the user's primary group based on their metrics
   * 
   * @param {string} userId - The user's ID
   * @returns {string|null} - The group ID or null if not found
   */
  async getUserGroup(userId) {
    const metrics = await this.getUserMetrics(userId);
    return metrics ? metrics.primaryGroup : null;
  }
  
  /**
   * Generate an insight for a user based on their metrics and group
   * 
   * @param {string} userId - The user's ID
   * @returns {Object} - The generated insight
   */
  async generateInsight(userId) {
    // Get the user's metrics
    const metrics = await this.getUserMetrics(userId);
    if (!metrics) {
      throw new Error(`No metrics found for user ${userId}`);
    }
    
    const groupId = metrics.primaryGroup;
    const characterClient = this.characterClients[groupId];
    
    if (!characterClient) {
      throw new Error(`No character client found for group ${groupId}`);
    }
    
    // Configure the client for this specific interaction
    characterClient.setConfig({
      responseModalities: [Modality.AUDIO, Modality.TEXT],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: CHARACTER_GROUPS[groupId].voice },
        },
      },
      systemInstruction: {
        parts: [{
          text: this.createCharacterSystemInstructions(groupId, metrics)
        }]
      }
    });
    
    // Generate the insight
    const insight = await new Promise((resolve, reject) => {
      let fullText = '';
      
      characterClient.connect().then(() => {
        // Send the request to the character
        characterClient.send({
          text: `Generate a daily insight for a user with these metric values: ${JSON.stringify(metrics.categories)}`
        }, true);
        
        // Listen for the response
        characterClient.on('text', (text) => {
          fullText += text;
        });
        
        characterClient.on('complete', () => {
          characterClient.disconnect();
          resolve(fullText);
        });
        
        characterClient.on('error', (error) => {
          reject(error);
        });
      }).catch(reject);
    });
    
    // Store the insight
    const insightData = {
      userId,
      groupId,
      timestamp: Date.now(),
      metrics: metrics.categories,
      character: CHARACTER_GROUPS[groupId].name,
      text: insight
    };
    
    await this.storeInsight(insightData);
    
    return insightData;
  }
  
  /**
   * Store an insight in the database
   * 
   * @param {Object} insight - The insight to store
   */
  async storeInsight(insight) {
    try {
      await this.firestore.collection('insights').doc(`${insight.userId}_${insight.timestamp}`).set(insight);
      console.log(`Stored insight for user ${insight.userId}`);
    } catch (error) {
      console.error(`Error storing insight for user ${insight.userId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get the latest insight for a user
   * 
   * @param {string} userId - The user's ID
   * @returns {Object|null} - The latest insight or null if not found
   */
  async getLatestInsight(userId) {
    try {
      const snapshot = await this.firestore.collection('insights')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();
        
      if (snapshot.empty) {
        return null;
      }
      
      return snapshot.docs[0].data();
    } catch (error) {
      console.error(`Error retrieving insight for user ${userId}:`, error);
      return null;
    }
  }
  
  /**
   * Create the system instructions for a character based on the group and metrics
   * 
   * @param {string} groupId - The group ID
   * @param {Object} metrics - The user's metrics
   * @returns {string} - The system instructions
   */
  createCharacterSystemInstructions(groupId, metrics) {
    const character = CHARACTER_GROUPS[groupId];
    
    // Approximate system instructions based on the Group and metrics
    return `
      You are ${character.name}, the representative of the ${groupId.replace(/-/g, ' ')} (${character.color} Group).
      
      Your role is to provide daily insights to members of your group that help them reflect on their journey.
      
      METRICS CONTEXT:
      These are the user's current metric values:
      ${Object.entries(metrics.categories).map(([category, value]) => `${category}: ${value}`).join('\n')}
      
      GROUP CHARACTERISTICS:
      ${this.getGroupCharacteristics(groupId)}
      
      INSIGHT GUIDELINES:
      * Keep insights under 150 words
      * Speak in the distinctive voice of ${character.name}
      * Reference the user's metric values indirectly
      * Focus on the aspects most relevant to your group
      * Include one thought-provoking question
      * End with a subtle call to action
      
      The insight should feel personal, insightful, and aligned with your group's values and philosophy.
    `;
  }
  
  /**
   * Get the characteristics of a group
   * 
   * @param {string} groupId - The group ID
   * @returns {string} - The group characteristics
   */
  getGroupCharacteristics(groupId) {
    // Approximate group characteristics
    const characteristics = {
      'group-alpha': 'Achievement-oriented, committed, intellectual, action-focused, and pragmatic',
      'group-beta': 'Connection-focused, loyal, loves deeply, resilient, and cosmically aligned',
      'group-gamma': 'Boundary-pushing, fierce, spicy, raw energy, sensual, and transformative',
      'group-delta': 'Reflective, visionary, fluid, adaptable, truthful, and perception-oriented',
      'group-epsilon': 'Generous, giving, expressive, emotionally abundant, vulnerable, and optimistic'
    };
    
    return characteristics[groupId] || 'Balanced across all groups';
  }
}

module.exports = MetricsCalculationService;