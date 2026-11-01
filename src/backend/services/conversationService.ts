import type { Conversation, Message } from '../types/database';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

export interface CreateConversationInput {
  userId: string;
  title?: string;
  workspaceId?: string | null;
  pinned?: boolean;
}

export interface AddMessageInput {
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Creates a new conversation in Supabase.
 */
export async function createConversation(
  input: CreateConversationInput
): Promise<Conversation> {
  const title = input.title || 'New Conversation';

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          user_id: input.userId,
          workspace_id: input.workspaceId || null,
          title,
          pinned: Boolean(input.pinned),
        })
        .select()
        .single();

      if (error) {
        console.error('[conversationService] Error creating conversation:', error.message);
        throw new Error(`Failed to create conversation: ${error.message} (${error.code})`);
      }

      return data;
    }
  }

  return {
    id: `conv_${Date.now()}`,
    user_id: input.userId,
    workspace_id: input.workspaceId || null,
    title,
    pinned: Boolean(input.pinned),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Retrieves all conversations for a user.
 */
export async function getConversations(userId: string): Promise<Conversation[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[conversationService] Error listing conversations:', error.message);
        throw new Error(`Failed to list conversations: ${error.message} (${error.code})`);
      }

      return data || [];
    }
  }

  return [];
}

/**
 * Retrieves a single conversation by ID.
 */
export async function getConversationById(
  conversationId: string
): Promise<Conversation | null> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();

      if (error) {
        console.error('[conversationService] Error fetching conversation:', error.message);
        throw new Error(`Failed to fetch conversation: ${error.message} (${error.code})`);
      }

      return data;
    }
  }

  return null;
}

/**
 * Deletes a conversation and its messages cascading in Supabase.
 */
export async function deleteConversation(conversationId: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) {
        console.error('[conversationService] Error deleting conversation:', error.message);
        throw new Error(`Failed to delete conversation: ${error.message} (${error.code})`);
      }

      return true;
    }
  }

  return true;
}

/**
 * Adds a message to a conversation.
 */
export async function addMessage(input: AddMessageInput): Promise<Message> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: input.conversationId,
          user_id: input.userId,
          role: input.role,
          content: input.content,
          metadata: input.metadata || {},
        })
        .select()
        .single();

      if (error) {
        console.error('[conversationService] Error inserting message:', error.message);
        throw new Error(`Failed to add message: ${error.message} (${error.code})`);
      }

      // Touch the conversation's updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', input.conversationId);

      return data;
    }
  }

  return {
    id: `msg_${Date.now()}`,
    conversation_id: input.conversationId,
    user_id: input.userId,
    role: input.role,
    content: input.content,
    metadata: input.metadata || {},
    created_at: new Date().toISOString(),
  };
}

/**
 * Retrieves all messages in a conversation.
 */
export async function getMessages(conversationId: string): Promise<Message[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[conversationService] Error fetching messages:', error.message);
        throw new Error(`Failed to fetch messages: ${error.message} (${error.code})`);
      }

      return data || [];
    }
  }

  return [];
}
