# ChatterBots with GetStream Integration

This documentation covers the implementation of the "chaos_theory" orchestration pattern for the ChatterBots application, including GetStream integration, metrics calculation, character state management, and tokenization.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [GetStream Integration](#getstream-integration)
4. [Tokenization Implementation](#tokenization-implementation)
5. [Response to Requirements](#response-to-requirements)
   - [DOTS to Guides Implementation](#dots-to-guides-implementation)
   - [Custom NPCs for Guides](#custom-npcs-for-guides)
   - [Fixing AIC Bugs](#fixing-aic-bugs)
6. [Usage and Examples](#usage-and-examples)

## Architecture Overview

The ChatterBots application follows a layered architecture with the following components:

- **Frontend Layer**: React components for chat interface
- **Middleware Layer**: Service classes for handling character management, metrics, and state
- **Backend Layer**: Database storage and external service integration

At the core of the architecture is the "chaos_theory" orchestration pattern, which acts as a central message router for all character interactions. This pattern provides several key benefits:

1. **Centralized Message Handling**: All messages are processed through a single point
2. **Reduced Connection Overhead**: Only one connection is needed per user session
3. **State Management**: Character state is centrally managed and persisted
4. **Context Preservation**: Character identity and grouping is consistent between interactions

## Core Components

### GetStreamIntegration

This service handles all communication with the GetStream API, including:

- Connecting to GetStream as the "chaos_theory" orchestrator
- Creating and managing channels for character conversations
- Routing messages to the appropriate character
- Sending responses back to users

### MetricsCalculationService

Responsible for calculating, storing, and applying user metrics:

- Tracks user activity and conversation patterns
- Calculates metrics based on user interactions
- Determines group affiliations
- Generates insights based on metrics and groups

### CharacterStateManager

Handles the persistence of character state across sessions:

- Manages character identity and greeting state
- Handles group assignments and transitions
- Ensures consistent behavior across interactions
- Fixes common AIC bugs by enhancing system instructions

### CustomCharacterService

Creates and manages AI character personalities:

- Generates character system instructions
- Configures Gemini Live API clients for each character
- Handles character creation, retrieval, and updates
- Manages character sessions and interactions

### React Components

- **StreamingIntegration**: Main component that connects the UI to backend services
- **MessageTokenizer**: Component that formats messages with parameter highlighting

## GetStream Integration

The GetStream integration follows the "chaos_theory" orchestration pattern:

1. **Channel Naming Convention**: Channels are named using the format `userId_characterId_timestamp`
2. **Invisible Orchestrator**: The "chaos_theory" bot is added to all chats but is invisible to users
3. **Message Routing**: All messages are processed by the orchestrator and routed to the appropriate character
4. **Character Management**: Characters are created and managed by the orchestrator

### Implementation Details

The key aspect of the implementation is that the frontend client creates chats with the following setup:

1. A unique channel ID in the format `userId_characterId_timestamp`
2. Adding the "chaos_theory" user to every chat
3. Adding the actual character to the chat (or having it added by the orchestrator)

When a message is sent to a chat, the following happens:

1. The "chaos_theory" orchestrator receives all messages
2. The orchestrator determines which character the message is for
3. The message is processed by the appropriate character
4. The response is sent back to the chat through the orchestrator

## Tokenization Implementation

The tokenization feature allows for displaying structured parameters in chat messages. The implementation includes:

1. **Parameter Detection**: Identifies different parameter formats in messages
2. **Formatting**: Applies special styling to highlighted parameters
3. **ChatML Support**: Processes ChatML formatted messages (`<|param:key=value|>`)

Parameters are displayed with special formatting depending on their type:

- **ChatML Parameters**: Blue background with structured format
- **JSON Objects**: Light blue background
- **Key:Value Pairs**: Light yellow background
- **Units**: Light green background

The implementation allows for toggling parameter highlighting and is designed to be non-intrusive for regular text.

## Response to Requirements

### DOTS to Guides Implementation

The implementation addresses the requirements for DOTS to Guides as follows:

1. **DOTS Calculation and Transmission**
   - The MetricsCalculationService calculates user metrics (DOTS equivalent)
   - Metrics are stored in Firestore with timestamp, user ID, and group information
   - The metrics are transmitted to the appropriate guide (character) based on the user's group
   
2. **Guide Provocation Generation**
   - The guide uses the metrics as context to generate personalized insights
   - The insights are stored in the database with timestamp, user ID, and guide information
   - The insights are available for display in the UI

3. **Multiple Group Support**
   - The system supports users belonging to multiple groups
   - Each group can generate its own insights
   - All insights are stored and retrievable for the user

4. **Database Storage**
   - All metrics and insights are stored in Firestore
   - The storage includes timestamp, user ID, guide name, and content
   - The data can be retrieved and displayed as needed

### Custom NPCs for Guides

The implementation provides a solution for creating custom NPCs similar to guides:

1. **Guide Model Duplication**
   - The CustomCharacterService allows creating new characters based on existing templates
   - System instructions can be customized while preserving core functionality
   
2. **RAG Compatibility**
   - The implementation preserves RAG capabilities in custom characters
   - RAG context is included in the character configuration
   - Characters can be updated with new RAG context as needed

3. **Consistent Behavior**
   - All characters use the same underlying state management system
   - The CharacterStateManager ensures consistent behavior across different character types
   - Groups and identities are preserved across interactions

### Fixing AIC Bugs

The implementation addresses the four AIC bugs:

1. **House Assignment Issues**
   - The CharacterStateManager tracks character group assignments
   - Assignments are persisted across sessions
   - Groups are explicitly included in system instructions

2. **House Reference After Change**
   - When a character's group changes, the state is completely reset
   - Special flags are added to prevent referencing the old group
   - The system instructions are updated to emphasize the new group identity

3. **Missing Greeting**
   - The initializeCharacterSession method ensures a greeting is always sent
   - The greeting state is tracked and persisted
   - Characters are instructed to greet on their first interaction

4. **Identity Re-identification**
   - The identityEstablished flag prevents characters from reintroducing themselves
   - The flag is set after the first few interactions
   - System instructions are updated to emphasize continuous conversation

## Usage and Examples

### Setting Up the Integration

```typescript
// Initialize the services
const getStreamIntegration = new GetStreamIntegration({
  apiKey: 'your-getstream-api-key',
  apiSecret: 'your-getstream-api-secret',
  projectId: 'your-firestore-project-id',
  geminiApiKey: 'your-gemini-api-key',
  orchestratorId: 'chaos_theory'
});

// Connect to GetStream
await getStreamIntegration.connect();

// Create a character
const characterConfig = {
  id: 'character-id',
  name: 'Character Name',
  traits: ['friendly', 'helpful', 'knowledgeable'],
  voice: 'en-US-Neural2-F',
  group: 'group-alpha'
};

const characterService = new CustomCharacterService('your-gemini-api-key');
await characterService.createCharacter(characterConfig);

// Create a channel for the character
const userId = 'user-id';
const channel = await getStreamIntegration.createCharacterChannel(userId, characterConfig.id);
```

### Using the TokenizedMessage Component

```jsx
import { TokenizedMessage } from '../components/MessageTokenizer';

function ChatMessage({ message }) {
  return (
    <TokenizedMessage 
      message={message.text}
      sender={message.user.name}
      timestamp={new Date(message.created_at).toLocaleString()}
      showTokens={true}
    />
  );
}
```

### Updating Character Group

```typescript
// Update a character's group
await characterService.updateCharacterGroup('character-id', 'new-group-id');

// The character will now identify as a member of the new group
// and will not reference the previous group
```

This implementation provides a comprehensive solution for the ChatterBots application, addressing all the requirements and fixing the identified bugs.
