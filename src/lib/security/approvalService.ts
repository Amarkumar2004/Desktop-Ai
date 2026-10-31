/**
 * Approval Service & Multi-Channel Synchronizer
 * Bridges Desktop GUI Popup, Voice Assistant (Hindi & English), and Chat Interface.
 * Ensures an approval or denial in any one channel instantly synchronizes across all channels.
 */

import { permissionManager } from './permissionManager';
import { PermissionRequest, PermissionChannel } from './types';

// Keywords for voice recognition in Hindi & English
const AFFIRMATIVE_KEYWORDS = [
  'haan',
  'ha',
  'yes',
  'allow',
  'kar do',
  'kar dijiye',
  'bhej do',
  'karo',
  'theek hai',
  'manzoor hai',
  'permission granted',
  'proceed',
  'approved',
  'ok kar do',
];

const NEGATIVE_KEYWORDS = [
  'nahi',
  'na',
  'no',
  'deny',
  'cancel',
  'mat karo',
  'rok do',
  'rehne do',
  'reject',
  'disallow',
  'stop',
  'don\'t',
  'mana hai',
];

export class ApprovalService {
  /**
   * Evaluates spoken utterance against active permission request.
   * Returns true if utterance was recognized as a definitive decision.
   */
  public static handleVoiceInput(transcript: string): {
    handled: boolean;
    decision?: 'APPROVED' | 'DENIED';
    requestId?: string;
  } {
    const activeReq = permissionManager.getActiveRequest();
    if (!activeReq || activeReq.status !== 'PENDING') {
      return { handled: false };
    }

    if (!transcript || typeof transcript !== 'string') {
      return { handled: false };
    }

    const clean = transcript.toLowerCase().trim();

    // Check for explicit rejection first
    const isNegative = NEGATIVE_KEYWORDS.some((kw) => {
      const regex = new RegExp(`(^|\\s)${kw}(\\s|$|\\.|!)`, 'i');
      return regex.test(clean);
    });

    if (isNegative) {
      console.log(`[ApprovalService] Voice DENIAL recognized: "${clean}"`);
      permissionManager.deny(activeReq.id, 'VOICE');
      return { handled: true, decision: 'DENIED', requestId: activeReq.id };
    }

    // Check for explicit approval
    const isAffirmative = AFFIRMATIVE_KEYWORDS.some((kw) => {
      const regex = new RegExp(`(^|\\s)${kw}(\\s|$|\\.|!)`, 'i');
      return regex.test(clean);
    });

    if (isAffirmative) {
      console.log(`[ApprovalService] Voice APPROVAL recognized: "${clean}"`);
      permissionManager.approve(activeReq.id, 'VOICE');
      return { handled: true, decision: 'APPROVED', requestId: activeReq.id };
    }

    // Unclear speech, noise, or other speech -> DO NOT APPROVE!
    return { handled: false };
  }

  /**
   * Approve via Desktop GUI Popup
   */
  public static approveByGui(requestId: string): boolean {
    return permissionManager.approve(requestId, 'GUI');
  }

  /**
   * Deny via Desktop GUI Popup
   */
  public static denyByGui(requestId: string): boolean {
    return permissionManager.deny(requestId, 'GUI');
  }

  /**
   * Approve via Chat Card
   */
  public static approveByChat(requestId: string): boolean {
    return permissionManager.approve(requestId, 'CHAT');
  }

  /**
   * Deny via Chat Card
   */
  public static denyByChat(requestId: string): boolean {
    return permissionManager.deny(requestId, 'CHAT');
  }

  /**
   * Subscribe to active permission changes
   */
  public static onPermissionChange(
    callback: (req: PermissionRequest | null) => void
  ): () => void {
    return permissionManager.subscribe(callback);
  }
}
