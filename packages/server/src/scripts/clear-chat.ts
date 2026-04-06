import { db } from '../db/index.js';
import {
  communityMessages,
  communityMessageAttachments,
  communityReactions,
  directMessages,
  directMessageAttachments,
  directConversationMembers,
  directConversations,
  channelMembers,
} from '../db/schema.js';

async function clear() {
  await db.delete(communityMessageAttachments);
  await db.delete(communityReactions);
  await db.delete(communityMessages);
  await db.delete(directMessageAttachments);
  await db.delete(directMessages);
  await db.delete(directConversationMembers);
  await db.delete(directConversations);
  await db.delete(channelMembers);
  console.log('All chat history cleared.');
  process.exit(0);
}

clear();
