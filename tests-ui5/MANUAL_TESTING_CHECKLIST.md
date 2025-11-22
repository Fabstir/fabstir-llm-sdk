# UI5 Manual Testing Checklist

**Status**: Phase 5.2 - Manual Testing
**Date**: 2025-11-13
**Tester**: _____________

## Prerequisites

- [ ] UI5 running on port 3002 (access via http://localhost:3012)
- [ ] MetaMask installed with Base Sepolia network configured
- [ ] Test account has testnet ETH (~0.01 ETH minimum)
- [ ] `.env.local` configured with correct contract addresses from `.env.test`

## 1. Wallet Connection (5 tests)

### 1.1 Initial Connection
- [ ] Navigate to http://localhost:3012
- [ ] Click "Connect Wallet" button
- [ ] MetaMask popup appears
- [ ] Approve connection in MetaMask
- [ ] Wallet address displays in navbar (format: `0x1234...5678`)
- [ ] No errors in browser console
- [ ] SDK initialization completes (check console for `[UI5SDK] SDK initialized successfully`)

**Expected Time**: 3-5 seconds

### 1.2 Wallet State Persistence
- [ ] Refresh the page (F5)
- [ ] Wallet remains connected (address still in navbar)
- [ ] No duplicate SDK initialization (check console)

### 1.3 Disconnect Wallet
- [ ] Click "Disconnect" button
- [ ] Wallet address disappears from navbar
- [ ] "Connect Wallet" button reappears
- [ ] SDK disconnected (check console for cleanup)

### 1.4 Reconnect After Disconnect
- [ ] Click "Connect Wallet" again
- [ ] MetaMask popup appears (may auto-approve if recently connected)
- [ ] Wallet reconnects successfully
- [ ] SDK reinitializes correctly

### 1.5 Wrong Network
- [ ] Switch MetaMask to Ethereum Mainnet
- [ ] Try to connect wallet
- [ ] Verify error handling (should prompt to switch to Base Sepolia)

**Notes**: _____________________________________________

---

## 2. Navigation (5 tests)

### 2.1 Dashboard Navigation
- [ ] Click "Dashboard" in navbar
- [ ] Page loads without errors
- [ ] URL is `/`
- [ ] Active nav item highlighted

### 2.2 Sessions Navigation
- [ ] Click "Sessions" in navbar
- [ ] Page loads without errors
- [ ] URL is `/session-groups`
- [ ] Active nav item highlighted

### 2.3 Databases Navigation
- [ ] Click "Databases" in navbar
- [ ] Page loads without errors
- [ ] URL is `/vector-databases`
- [ ] Active nav item highlighted

### 2.4 Settings Navigation
- [ ] Click "Settings" in navbar
- [ ] Page loads without errors
- [ ] URL is `/settings`
- [ ] Active nav item highlighted

### 2.5 Mobile Menu (if applicable)
- [ ] Resize browser to mobile width (<768px)
- [ ] Mobile menu button appears
- [ ] Click menu button
- [ ] Navigation menu opens
- [ ] All nav items visible and clickable

**Notes**: _____________________________________________

---

## 3. Session Groups (10 tests)

### 3.1 Create Session Group
- [ ] Navigate to `/session-groups`
- [ ] Click "Create Session Group" button
- [ ] Fill in group name (e.g., "Test Project")
- [ ] Fill in description (optional)
- [ ] Click "Create"
- [ ] Loading state shows (button disabled with spinner)
- [ ] **Blockchain transaction appears in MetaMask**
- [ ] Approve transaction
- [ ] **Wait 5-15 seconds for blockchain confirmation**
- [ ] Success message appears
- [ ] New group appears in list
- [ ] Group card shows correct name and description

**Expected Time**: 5-15 seconds (blockchain transaction)
**Gas Fee**: ~0.0001-0.0005 ETH

### 3.2 View Session Group Details
- [ ] Click on created session group card
- [ ] Detail page loads (`/session-groups/[id]`)
- [ ] Group name and description displayed correctly
- [ ] "Chat Sessions" section visible
- [ ] "Documents" section visible (if implemented)
- [ ] "Create Chat Session" button available

### 3.3 Create Chat Session in Group
- [ ] On session group detail page, click "Create Chat Session"
- [ ] Fill in session name (e.g., "Test Chat")
- [ ] Select model (if dropdown exists)
- [ ] Click "Create"
- [ ] **Blockchain transaction appears in MetaMask**
- [ ] Approve transaction
- [ ] **Wait 5-15 seconds for blockchain confirmation**
- [ ] New chat session appears in list
- [ ] Session card shows correct name

**Expected Time**: 5-15 seconds (blockchain transaction)

### 3.4 Send Chat Message
- [ ] Click on created chat session
- [ ] Chat interface loads
- [ ] Type message in input field (e.g., "Hello, how are you?")
- [ ] Click send button
- [ ] User message appears immediately
- [ ] Loading indicator shows (thinking animation)
- [ ] **Wait 5-15 seconds for WebSocket streaming**
- [ ] AI response streams in (word by word)
- [ ] Response completes successfully
- [ ] No errors in console

**Expected Time**: 5-15 seconds (LLM inference)

### 3.5 Send Follow-up Message
- [ ] Type another message in same session
- [ ] Click send
- [ ] Message sends successfully
- [ ] AI responds with context from previous message
- [ ] Conversation history maintained

### 3.6 Navigate Away and Return
- [ ] Click "Dashboard" in navbar
- [ ] Click "Sessions" to return
- [ ] Session group still visible
- [ ] Click on session group
- [ ] Chat session still visible
- [ ] Click on chat session
- [ ] Conversation history intact (all messages visible)

### 3.7 Delete Chat Session
- [ ] On chat session, find delete button (trash icon or "Delete" button)
- [ ] Click delete
- [ ] Confirmation dialog appears
- [ ] Confirm deletion
- [ ] **Blockchain transaction in MetaMask** (may be gasless if sub-account configured)
- [ ] Session removed from list
- [ ] Cannot access deleted session URL

### 3.8 Upload Document to Session Group (if implemented)
- [ ] On session group detail page, find "Upload Document" button
- [ ] Click button
- [ ] Select PDF or text file (< 10MB)
- [ ] Click "Upload"
- [ ] **S5 upload progress shown (2-10 seconds)**
- [ ] Document appears in documents list
- [ ] Document name and size displayed correctly

**Expected Time**: 2-10 seconds (S5 storage)

### 3.9 Link Vector Database to Session Group (if implemented)
- [ ] On session group detail page, find "Link Database" button
- [ ] Click button
- [ ] Select existing vector database from dropdown
- [ ] Click "Link"
- [ ] **Blockchain transaction in MetaMask**
- [ ] Database linked successfully
- [ ] Linked database badge appears on group

### 3.10 Delete Session Group
- [ ] On session groups list, find delete button on group card
- [ ] Click delete
- [ ] Confirmation dialog appears ("This will delete all sessions")
- [ ] Confirm deletion
- [ ] **Blockchain transaction in MetaMask**
- [ ] Group removed from list
- [ ] All child sessions also deleted

**Notes**: _____________________________________________

---

## 4. Vector Databases (8 tests)

### 4.1 Create Vector Database
- [ ] Navigate to `/vector-databases`
- [ ] Click "Create Vector Database" button
- [ ] Fill in database name (e.g., "My Docs")
- [ ] Fill in description (optional)
- [ ] Select embedding model (if dropdown exists)
- [ ] Click "Create"
- [ ] **Blockchain transaction in MetaMask**
- [ ] Approve transaction
- [ ] **Wait 5-15 seconds for blockchain confirmation**
- [ ] Success message appears
- [ ] New database appears in list

**Expected Time**: 5-15 seconds (blockchain transaction)

### 4.2 View Vector Database Details
- [ ] Click on created database card
- [ ] Detail page loads (`/vector-databases/[id]`)
- [ ] Database name and description displayed
- [ ] "Documents" section visible
- [ ] "Upload Document" button available
- [ ] "Search" input visible

### 4.3 Upload Document to Vector Database
- [ ] On database detail page, click "Upload Document"
- [ ] Select PDF or text file (< 10MB)
- [ ] Click "Upload"
- [ ] **S5 upload starts (2-10 seconds)**
- [ ] Progress indicator shown
- [ ] Document appears in list after upload
- [ ] Document shows file name, size, and upload date

**Expected Time**: 2-10 seconds (S5 storage)

### 4.4 Upload Multiple Documents
- [ ] Upload another document to same database
- [ ] Both documents visible in list
- [ ] Document count updates

### 4.5 Search Vector Database
- [ ] In search input, type query (e.g., "What is the main topic?")
- [ ] Click search button
- [ ] **Wait 1-3 seconds for vector search**
- [ ] Search results appear
- [ ] Results show matched text snippets
- [ ] Relevance scores displayed (if implemented)

**Expected Time**: 1-3 seconds (vector search)

### 4.6 Delete Document from Vector Database
- [ ] On database detail page, find delete button on document card
- [ ] Click delete
- [ ] Confirmation dialog appears
- [ ] Confirm deletion
- [ ] Document removed from list
- [ ] **S5 storage updated (2-5 seconds)**

### 4.7 Unlink Database from Session Group (if applicable)
- [ ] If database is linked to a session group, find "Unlink" button
- [ ] Click unlink
- [ ] Confirmation dialog appears
- [ ] Confirm unlink
- [ ] **Blockchain transaction in MetaMask** (may be gasless)
- [ ] Database unlinked successfully
- [ ] Badge removed from group

### 4.8 Delete Vector Database
- [ ] On vector databases list, find delete button on database card
- [ ] Click delete
- [ ] Confirmation dialog appears ("This will delete all documents")
- [ ] Confirm deletion
- [ ] **Blockchain transaction in MetaMask**
- [ ] Database removed from list
- [ ] All documents also deleted from S5

**Notes**: _____________________________________________

---

## 5. Settings (5 tests)

### 5.1 View Settings Page
- [ ] Navigate to `/settings`
- [ ] Page loads without errors
- [ ] User settings form visible
- [ ] Current wallet address displayed

### 5.2 Update User Preferences (if implemented)
- [ ] Change setting (e.g., default model, theme, etc.)
- [ ] Click "Save" button
- [ ] **S5 storage update (1-3 seconds)**
- [ ] Success message appears
- [ ] Setting persists after page refresh

**Expected Time**: 1-3 seconds (S5 storage)

### 5.3 View Account Balance
- [ ] If balance section exists, verify it shows correct ETH balance
- [ ] If USDC balance exists, verify it's displayed
- [ ] Balances match MetaMask (approximately)

### 5.4 Export Data (if implemented)
- [ ] Find "Export Data" button
- [ ] Click button
- [ ] Data export starts
- [ ] JSON or CSV file downloads
- [ ] File contains user data (sessions, documents, etc.)

### 5.5 Import Data (if implemented)
- [ ] Find "Import Data" button
- [ ] Select previously exported file
- [ ] Click "Import"
- [ ] Data imported successfully
- [ ] Verify imported data appears in UI

**Notes**: _____________________________________________

---

## 6. Notifications (3 tests)

### 6.1 View Notifications Page
- [ ] Navigate to `/notifications`
- [ ] Page loads without errors
- [ ] Notifications list visible (may be empty)

### 6.2 Notification Badge (if implemented)
- [ ] If unread notifications exist, badge appears on bell icon in navbar
- [ ] Badge shows correct count (e.g., "3")
- [ ] Clicking bell icon navigates to notifications page

### 6.3 Mark Notification as Read (if implemented)
- [ ] Click on notification
- [ ] Notification marked as read (visual change)
- [ ] Badge count decreases
- [ ] Notification remains in list but shows as read

**Notes**: _____________________________________________

---

## 7. Error Handling (10 tests)

### 7.1 Network Error Simulation
- [ ] Disconnect internet connection
- [ ] Try to create session group
- [ ] Error message appears ("Network error, please check connection")
- [ ] Error is user-friendly (not raw error stack)
- [ ] Reconnect internet
- [ ] Retry operation
- [ ] Operation succeeds

### 7.2 Insufficient Gas Fees
- [ ] Ensure test account has < 0.0001 ETH
- [ ] Try to create session group
- [ ] MetaMask shows "Insufficient funds" error
- [ ] UI shows error message
- [ ] Add ETH to account
- [ ] Retry operation
- [ ] Operation succeeds

### 7.3 Transaction Rejection
- [ ] Try to create session group
- [ ] Reject transaction in MetaMask
- [ ] UI shows "Transaction rejected by user"
- [ ] No permanent state change
- [ ] Can retry operation
- [ ] Retry with approval works

### 7.4 Invalid File Upload
- [ ] Try to upload file > 10MB
- [ ] Error message appears ("File too large")
- [ ] Upload rejected
- [ ] Try to upload unsupported file type (e.g., .exe)
- [ ] Error message appears ("Unsupported file type")

### 7.5 Empty Form Submission
- [ ] Try to create session group with empty name
- [ ] Validation error appears ("Name is required")
- [ ] Form does not submit
- [ ] Fill in name
- [ ] Form submits successfully

### 7.6 S5 Storage Timeout
- [ ] **(Cannot easily test manually - requires network manipulation)**
- [ ] Verify error handling exists in code for S5 timeouts
- [ ] Check console for timeout error messages if S5 is slow

### 7.7 WebSocket Connection Failure
- [ ] **(Cannot easily test manually - requires node shutdown)**
- [ ] If chat fails to connect, verify error message appears
- [ ] Check console for WebSocket errors

### 7.8 Blockchain Confirmation Timeout
- [ ] Submit transaction during network congestion (rare on testnet)
- [ ] If confirmation takes > 60 seconds, verify timeout handling
- [ ] Error message should appear ("Transaction pending, please wait")

### 7.9 Session Expired (if implemented)
- [ ] Leave UI idle for extended period (if session timeout exists)
- [ ] Try to perform operation
- [ ] Error appears ("Session expired, please reconnect wallet")
- [ ] Reconnect wallet works

### 7.10 Browser Console Errors
- [ ] Open browser DevTools (F12)
- [ ] Perform all operations above
- [ ] **No red error messages in console during normal operations**
- [ ] Only expected warnings (favicon.ico, etc.)

**Notes**: _____________________________________________

---

## 8. Performance (5 tests)

### 8.1 Page Load Time
- [ ] Refresh homepage (/)
- [ ] Page loads in < 3 seconds
- [ ] No layout shift (CLS)
- [ ] All components render correctly

### 8.2 Wallet Connection Time
- [ ] Click "Connect Wallet"
- [ ] Connection completes in < 5 seconds
- [ ] SDK initialization completes in < 5 seconds

### 8.3 Navigation Speed
- [ ] Click between Dashboard → Sessions → Databases → Settings
- [ ] Each navigation completes in < 1 second
- [ ] No lag or freezing

### 8.4 Chat Streaming Latency
- [ ] Send chat message
- [ ] First chunk arrives in < 5 seconds
- [ ] Streaming continues smoothly (no long pauses)
- [ ] Complete response arrives in < 15 seconds

### 8.5 Large Document Upload
- [ ] Upload 5MB PDF
- [ ] Upload completes in < 10 seconds
- [ ] Progress indicator updates smoothly
- [ ] No UI freezing during upload

**Notes**: _____________________________________________

---

## 9. Cross-Browser Testing (Optional)

### 9.1 Chrome
- [ ] Repeat core tests (Wallet, Navigation, Session Groups)
- [ ] All features work correctly

### 9.2 Firefox
- [ ] Repeat core tests
- [ ] All features work correctly

### 9.3 Safari (if on macOS)
- [ ] Repeat core tests
- [ ] All features work correctly

**Notes**: _____________________________________________

---

## 10. Mobile Responsive (Optional)

### 10.1 Mobile View (< 768px)
- [ ] Resize browser to mobile width
- [ ] Layout adapts correctly
- [ ] Mobile menu works
- [ ] All features accessible
- [ ] No horizontal scroll

### 10.2 Tablet View (768px - 1024px)
- [ ] Resize browser to tablet width
- [ ] Layout adapts correctly
- [ ] All features accessible

**Notes**: _____________________________________________

---

## Summary

**Total Tests**: 61
**Passed**: _____ / 61
**Failed**: _____ / 61
**Skipped**: _____ / 61

**Critical Issues Found**: ___________________________________________

**Non-Critical Issues**: _____________________________________________

**Overall Assessment**:
- [ ] Ready for Phase 5.3 (Automated Tests)
- [ ] Blockers found, need fixes before proceeding

**Tester Signature**: ________________
**Date Completed**: _________________
