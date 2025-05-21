/**
 * StreamingIntegration.jsx
 *
 * React component for integrating streaming AI with metrics and character systems
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useUser, useAgent } from '../hooks/state';
import { useLiveAPIContext } from '../contexts/LiveAPIContext';
import { Modality } from '@google/genai';

/**
 * Component for integrating the streaming character system with metrics and insights
 */
function StreamingIntegration({ userId, channelId, characterId }) {
  // References to the services (would be initialized elsewhere)
  const metricsServiceRef = useRef(null);
  const characterServiceRef = useRef(null);
  
  // Get the context and state from ChatterBots
  const { client, connected, connect, disconnect, setConfig } = useLiveAPIContext();
  const { current: agent } = useAgent();
  const user = useUser();
  
  // Local state
  const [groupName, setGroupName] = useState(null);
  const [latestMetrics, setLatestMetrics] = useState(null);
  const [latestInsight, setLatestInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  /**
   * Fetch the user's metrics and group from the server
   */
  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      
      if (!metricsServiceRef.current) {
        console.error('Metrics service not initialized');
        setError('Metrics service not initialized');
        return;
      }
      
      // Fetch the user's metrics
      const metrics = await metricsServiceRef.current.getUserMetrics(userId);
      setLatestMetrics(metrics);
      
      // Fetch the user's group
      const group = await metricsServiceRef.current.getUserGroup(userId);
      setGroupName(group);
      
      // Fetch the latest insight
      const insight = await metricsServiceRef.current.getLatestInsight(userId);
      setLatestInsight(insight);
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching user data:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [userId]);
  
  /**
   * Initialize the character with the appropriate group and personality
   */
  const initializeCharacter = useCallback(async () => {
    try {
      if (!characterServiceRef.current) {
        console.error('Character service not initialized');
        return;
      }
      
      if (!characterId) {
        console.warn('No character ID provided');
        return;
      }
      
      // Get the character
      const character = await characterServiceRef.current.getCharacter(characterId);
      
      // Update the character's group if different from user's group
      if (groupName && (!character.group || character.group !== groupName)) {
        await characterServiceRef.current.updateCharacterGroup(characterId, groupName);
      }
      
      // Initialize the character session (handles greeting)
      await characterServiceRef.current.initializeCharacterSession(characterId);
    } catch (err) {
      console.error('Error initializing character:', err);
    }
  }, [characterId, groupName]);
  
  /**
   * Configure the Live API client based on the user's group and metrics
   */
  const configureClient = useCallback(() => {
    // Only configure if we have a group and metrics
    if (!groupName || !latestMetrics) {
      return;
    }
    
    // Create system instructions that incorporate the user's group and metrics
    const enhancedInstructions = `
      ${agent.personality || ''}
      
      IMPORTANT USER CONTEXT:
      - The user belongs to the ${groupName}
      - Their metric values are: ${latestMetrics ? JSON.stringify(latestMetrics.categories) : 'unknown'}
      - Their latest insight was: "${latestInsight ? latestInsight.text : 'No insight yet'}"
      
      When responding to the user, acknowledge their group membership subtly without explicitly mentioning metrics.
      React to their insight context when relevant to the conversation.
    `;
    
    // Configure the client
    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: agent.voice },
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
  }, [agent, groupName, latestMetrics, latestInsight, setConfig]);
  
  /**
   * Initialize services on component mount
   */
  useEffect(() => {
    // In a real implementation, these would be initialized elsewhere and passed as props
    const initServices = async () => {
      try {
        // Dynamic imports to avoid dependency issues
        const { MetricsCalculationService } = await import('../services/MetricsCalculationService');
        const { CustomCharacterService } = await import('../services/CustomCharacterService');
        
        // Initialize services
        metricsServiceRef.current = new MetricsCalculationService('your-api-key');
        characterServiceRef.current = new CustomCharacterService('your-api-key');
        
        // Fetch user data
        await fetchUserData();
      } catch (err) {
        console.error('Error initializing services:', err);
        setError(err.message);
      }
    };
    
    initServices();
    
    // Clean up on unmount
    return () => {
      // Clean up any connections
      if (connected) {
        disconnect();
      }
    };
  }, [fetchUserData, connected, disconnect]);
  
  /**
   * Update when user data changes
   */
  useEffect(() => {
    if (groupName && latestMetrics) {
      // Configure the client
      configureClient();
      
      // Initialize the character if provided
      if (characterId) {
        initializeCharacter();
      }
    }
  }, [groupName, latestMetrics, configureClient, initializeCharacter, characterId]);
  
  /**
   * Handle sending a message to the AI
   */
  const handleSendMessage = useCallback(async (messageText) => {
    try {
      if (!connected) {
        await connect();
      }
      
      // Send the message to the AI
      client.send({ text: messageText }, false);
      
      // Track user activity for metrics calculation
      if (metricsServiceRef.current) {
        // In a real implementation, we would collect these activities over time
        const userActivities = [
          {
            type: 'conversation',
            text: messageText,
            timestamp: Date.now(),
            depth: calculateConversationDepth(messageText),
            reflection: calculateReflectionLevel(messageText)
          }
        ];
        
        // Update metrics asynchronously
        metricsServiceRef.current.calculateUserMetrics(userId, userActivities).catch(console.error);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message);
    }
  }, [client, connected, connect, userId]);
  
  /**
   * Calculate the depth of a conversation
   * This would be a more sophisticated algorithm in a real implementation
   */
  const calculateConversationDepth = (text) => {
    // Simple example - length and complexity
    const wordCount = text.split(/\s+/).length;
    const complexWords = text.split(/\s+/).filter(word => word.length > 7).length;
    
    return Math.min(10, (wordCount / 20) + (complexWords / 2));
  };
  
  /**
   * Calculate the reflection level in a message
   * This would be a more sophisticated algorithm in a real implementation
   */
  const calculateReflectionLevel = (text) => {
    // Simple example - presence of reflective phrases
    const reflectiveWords = ['think', 'feel', 'believe', 'wonder', 'reflect', 'consider'];
    const reflectiveCount = reflectiveWords.reduce((count, word) => {
      return count + (text.toLowerCase().includes(word) ? 1 : 0);
    }, 0);
    
    return Math.min(10, reflectiveCount * 2);
  };
  
  /**
   * Generate a new daily insight on demand
   */
  const handleGenerateInsight = useCallback(async () => {
    try {
      if (!metricsServiceRef.current) {
        console.error('Metrics service not initialized');
        return;
      }
      
      // Generate a new insight
      const insight = await metricsServiceRef.current.generateInsight(userId);
      
      // Update state
      setLatestInsight(insight);
      
      return insight;
    } catch (err) {
      console.error('Error generating insight:', err);
      setError(err.message);
    }
  }, [userId]);
  
  // Render the component
  if (loading) {
    return <div>Loading user data...</div>;
  }
  
  if (error) {
    return <div>Error: {error}</div>;
  }
  
  return (
    <div className="streaming-integration">
      <div className="user-profile">
        <h2>{user.name || 'User'}'s Profile</h2>
        {groupName && (
          <div className="group-info">
            <h3>Group: {groupName}</h3>
            <p>Your representative is watching your journey.</p>
          </div>
        )}
        
        {latestMetrics && (
          <div className="metrics-display">
            <h3>Your Metrics</h3>
            <ul>
              {Object.entries(latestMetrics.categories).map(([category, value]) => (
                <li key={category}>
                  <span className="category">{category}:</span>
                  <span className="value">{value.toFixed(1)}</span>
                  <div className="meter" style={{ width: `${value * 10}%` }} />
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {latestInsight && (
          <div className="insight">
            <h3>Daily Insight from {latestInsight.character}</h3>
            <div className="insight-text">
              {latestInsight.text}
            </div>
            <div className="insight-timestamp">
              {new Date(latestInsight.timestamp).toLocaleString()}
            </div>
          </div>
        )}
        
        <button onClick={handleGenerateInsight}>
          Request New Insight
        </button>
      </div>
      
      <div className="chat-interface">
        {/* Chat interface for streaming would go here */}
        {/* This would use the existing ChatterBots UI components */}
      </div>
    </div>
  );
}

export default StreamingIntegration;