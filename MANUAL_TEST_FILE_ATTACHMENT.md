# Manual Test: File Attachment Content Hiding

## What Was Implemented

1. **File content embedding** in `page.tsx` (lines 635-689):
   - Reads file content when user attaches a file
   - Embeds display text and attachment metadata using special markers
   - Format: `<<DISPLAY>>question<</DISPLAY>><<ATTACHMENTS>>[...]<</ATTACHMENTS>>\nfile content...`

2. **Marker parsing** in `message-bubble.tsx` (lines 36-64):
   - Parses the embedded markers using regex
   - Extracts only the display text (hides file content)
   - Shows attachment badge with file name and size

3. **Regex validation** (`test-regex.js`):
   - ✅ Regex patterns work correctly
   - Successfully extracts display text: "Who directed the movie The Whale?"
   - Successfully extracts attachments array

## Known Issue

**Old sessions won't work** - Messages saved before we implemented the embedding don't have the markers, so they'll still show file content.

## Test Steps (Fresh Session Required)

### Step 1: Create New Session
1. Navigate to http://localhost:3012
2. Connect wallet
3. Click "New Session" button
4. You should see empty chat interface

### Step 2: Attach File and Send
1. Click the paperclip icon (📎)
2. Select a text file (e.g., "The Whale v2.txt")
3. Type a question: "Who directed the movie The Whale?"
4. Click Send

### Step 3: Verify Results

**Expected behavior:**
- ✅ Only your question appears in the user message bubble
- ✅ File content is completely hidden
- ✅ Attachment badge shows: "📎 The Whale v2.txt (X KB)"
- ✅ AI response appears below

**If you see markers like `<<DISPLAY>>` or file content:**
- ❌ This means you're viewing an OLD session
- Create a completely NEW session and try again

### Step 4: Test Persistence
1. Click "End Session" button
2. Navigate back to the session
3. Verify file content is still hidden

## Debugging

If it still doesn't work in a NEW session:

1. Open browser console (F12)
2. Look for logs starting with `[parseMessageContent]`
3. Check if:
   - `displayMatch found: true` ✅
   - `attachmentsMatch found: true` ✅

If false, the markers aren't in the content (bug in page.tsx)
If true, the parsing is working (bug in message-bubble.tsx rendering)

## Files Modified

- `/workspace/apps/ui5/app/session-groups/[id]/[sessionId]/page.tsx` (lines 635-689)
- `/workspace/apps/ui5/components/chat/message-bubble.tsx` (lines 36-78, 122-137)

## Summary

The code is implemented and the regex works in isolation. The most likely issue is testing with old sessions that don't have the embedded markers. **You MUST create a brand new session and attach a file to properly test this feature.**

When you're rested and ready to test, just:
1. Create NEW session
2. Attach file
3. Send message
4. Verify file content is hidden

That's it. Sorry for the long debugging session - these things happen with real-time UI testing.
