/**
 * MessageTokenizer.jsx
 * 
 * Component to tokenize and format messages with parameters
 */

import React from 'react';

/**
 * Parses ChatML formatted messages and formats parameters
 * 
 * @param {string} text - The message text that may contain parameters
 * @returns {object} - Parsed parameters and formatted text
 */
const parseChatML = (text) => {
  if (!text) return { parameters: [], formattedText: '' };
  
  // Pattern for ChatML parameter format: <|param:key=value|>
  const paramRegex = /<\|param:(\w+)=([^|]*)\|>/g;
  
  const parameters = [];
  let matches;
  
  // Find all parameters in the text
  while ((matches = paramRegex.exec(text)) !== null) {
    parameters.push({
      fullMatch: matches[0],
      key: matches[1],
      value: matches[2]
    });
  }
  
  // Replace each parameter with a React-friendly format for later rendering
  let formattedText = text;
  parameters.forEach((param, index) => {
    formattedText = formattedText.replace(
      param.fullMatch, 
      `__PARAM_START_${index}__${param.key}:${param.value}__PARAM_END_${index}__`
    );
  });
  
  return { parameters, formattedText };
};

/**
 * Component to tokenize and format message text with special highlighting for parameters
 */
const MessageTokenizer = ({ text, showTokens = true }) => {
  if (!text) return null;
  
  // Parse any ChatML parameters
  const { formattedText } = parseChatML(text);
  
  // Define patterns for different parameter types
  const patterns = [
    // ChatML parameter markers
    {
      regex: /__PARAM_START_(\d+)__(.*?)__PARAM_END_\1__/g,
      renderer: (match, key, content) => (
        <span 
          key={`chatml-${key}`} 
          className="parameter-chatml"
          style={{ 
            backgroundColor: '#e6f7ff', 
            borderRadius: '4px',
            padding: '2px 4px',
            margin: '0 2px',
            fontFamily: 'monospace',
            border: '1px solid #91d5ff',
            color: '#0050b3'
          }}
        >
          {content}
        </span>
      )
    },
    
    // JSON objects
    {
      regex: /(\{[^{}]*\})/g,
      renderer: (match, key) => {
        try {
          // Verify it's valid JSON
          JSON.parse(match);
          return showTokens ? (
            <span 
              key={`json-${key}`} 
              className="parameter-json"
              style={{ 
                backgroundColor: '#f0f8ff', 
                borderRadius: '4px',
                padding: '2px 4px',
                margin: '0 2px',
                fontFamily: 'monospace',
                border: '1px solid #d6e4ff',
                color: '#0066cc'
              }}
            >
              {match}
            </span>
          ) : match;
        } catch (e) {
          return match;
        }
      }
    },
    
    // Key:value pairs
    {
      regex: /(\b\w+:[^\s,;]+)/g,
      renderer: (match, key) => showTokens ? (
        <span 
          key={`param-${key}`} 
          className="parameter-token"
          style={{ 
            backgroundColor: '#f5f5dc', 
            borderRadius: '4px',
            padding: '2px 4px',
            margin: '0 2px',
            fontFamily: 'monospace',
            border: '1px solid #e6e6b8',
            color: '#5c5c3d'
          }}
        >
          {match}
        </span>
      ) : match
    },
    
    // Numeric values with units
    {
      regex: /(\b\d+(\.\d+)?(px|em|rem|vh|vw|%|s|ms)\b)/g,
      renderer: (match, key) => showTokens ? (
        <span 
          key={`unit-${key}`} 
          className="parameter-unit"
          style={{ 
            backgroundColor: '#f0fff0', 
            borderRadius: '4px',
            padding: '2px 4px',
            margin: '0 2px',
            fontFamily: 'monospace',
            border: '1px solid #d6f5d6',
            color: '#006600'
          }}
        >
          {match}
        </span>
      ) : match
    }
  ];

  // Process the text with the patterns
  let segments = [formattedText];
  
  patterns.forEach(pattern => {
    segments = segments.flatMap(segment => {
      if (typeof segment !== 'string') return segment;
      
      const parts = segment.split(pattern.regex);
      
      const processed = [];
      for (let i = 0; i < parts.length; i++) {
        if (i % pattern.regex.toString().includes('(') ? pattern.regex.toString().match(/\(/g).length + 1 : 2 === 0) {
          if (parts[i]) processed.push(parts[i]);
        } else {
          const isPatternMatch = pattern.regex.toString().includes('__PARAM_');
          
          if (isPatternMatch && parts[i+1] && parts[i+2]) {
            // For ChatML parameters, we need to pass the group number and content
            processed.push(pattern.renderer(parts[i], parts[i+1], parts[i+2]));
            i += 2; // Skip the next parts as they're captured groups
          } else {
            // For other patterns
            processed.push(pattern.renderer(parts[i], i));
          }
        }
      }
      
      return processed;
    });
  });

  return (
    <div className="tokenized-message">
      {segments}
    </div>
  );
};

/**
 * Component for displaying a chat message with tokenized parameters
 */
const TokenizedMessage = ({ message, sender, timestamp, showTokens = true }) => {
  return (
    <div className="message-container">
      <div className="message-header">
        <span className="message-sender">{sender}</span>
        <span className="message-time">{timestamp}</span>
      </div>
      <div className="message-content">
        <MessageTokenizer text={message} showTokens={showTokens} />
      </div>
    </div>
  );
};

export { MessageTokenizer, TokenizedMessage, parseChatML };
