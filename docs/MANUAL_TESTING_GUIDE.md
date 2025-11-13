# Manual Testing Guide for UI4

**Date**: 2025-01-12
**Test Files**: `/tmp/test-doc-{1,2,3}.{txt,md,json}`
**Server**: http://localhost:3001

## Testing Notes
- Keep browser DevTools console open (F12 → Console tab)
- Report ALL console errors to Claude
- Take screenshots if issues occur
- Test files are ready in `/tmp/`

---

## Phase 1: Verify Dashboard

### Steps:
1. Navigate to http://localhost:3001
2. Verify page loads without errors
3. Check browser console for errors
4. Verify "Fabstir UI4" logo appears
5. Verify "Connect Wallet" button appears

### Expected Result:
✅ Dashboard loads clean with no console errors

### Report Back:
- Any console errors?
- Screenshot if issues found

---

## Phase 2: Vector Database Operations

### Test 2.1: Navigate to Vector Databases
1. Click "Vector Databases" in navigation OR
2. Navigate to http://localhost:3001/vector-databases
3. Check console for errors

**Report**: Does page load? Any errors in console?

### Test 2.2: Create New Vector Database
1. Click "+ New Database" button
2. Check if form appears
3. Check console for errors (CRITICAL: look for "getDatabaseMetadata is not a function")

**If form loads:**
- Fill name: "Test Database 1"
- Fill description: "Test database for comprehensive testing"
- Click Create/Save button
- Wait for completion
- Check console for errors

**Report**: Did database get created? Any errors?

###Test 2.3: Upload Files to Database (IF database created successfully)
1. From database detail page, look for Upload button
2. Click upload button
3. Select all 3 test files from `/tmp/`:
   - test-doc-1.txt
   - test-doc-2.md
   - test-doc-3.json
4. Wait for upload to complete
5. Check console for errors

**Report**: Did files upload? Are they visible in list?

---

## Phase 3: Session Group Operations

### Test 3.1: Navigate to Session Groups
1. Navigate to http://localhost:3001/session-groups
2. Check console for errors

**Report**: Does page load? Any errors?

### Test 3.2: Create New Session Group
1. Click "+ New Group" button
2. Check if form appears
3. Check console for errors (CRITICAL: look for "SDK not initialized")

**If form loads:**
- Fill name: "Test Session Group"
- Fill description: "Testing session group functionality"
- Click Create/Save button
- Wait for completion
- Check console for errors

**Report**: Did group get created? Any "SDK not initialized" errors?

### Test 3.3: Upload Documents to Group (IF group created successfully)
1. From group detail page, find "Group Documents" section
2. Click "+ Upload" button
3. Select `/tmp/test-doc-1.txt`
4. Wait for upload
5. Check console for errors

**Report**: Did document upload? Is it visible in list?

### Test 3.4: Upload Multiple Documents
1. Click "+ Upload" again
2. Select both:
   - `/tmp/test-doc-2.md`
   - `/tmp/test-doc-3.json`
3. Wait for uploads
4. Check console for errors

**Report**: Did both files upload? Total shows 3 documents?

---

## Critical Issues to Watch For

### BUG #1 (should be fixed):
- **Error**: "vectorRAGManager.getDatabaseMetadata is not a function"
- **Where**: When creating vector database
- **Status**: Should be FIXED in latest code

### BUG #2 (needs testing):
- **Error**: "SDK not initialized"
- **Where**: When creating session group
- **Symptom**: Wallet might be connected but SDK managers are null

---

## Reporting Template

When you find an issue, copy this template:

```
**Issue Found**: [Brief description]
**Phase**: [e.g., 2.2, 3.1]
**Page**: [URL]
**Console Error**: [Copy exact error message]
**Screenshot**: [Describe what's visible]
**Severity**: [Critical/High/Medium/Low]
```

---

## Quick Start

**Fastest way to help Claude test**:

1. Open http://localhost:3001 in browser
2. Open DevTools (F12 → Console tab)
3. Try creating a vector database
4. Try creating a session group
5. Copy ALL console errors and paste to Claude
6. Claude will fix issues and iterate

**That's it!** Just report errors, Claude handles fixes.

---

# ADDENDUM: Bug Verification Tests

**Added**: 2025-01-12 22:45 UTC
**Purpose**: Verify the 4 critical bugs fixed during automated testing

---

## BUG #3 Verification: Vector Databases Infinite Loop

**What was fixed**: Infinite render loop causing page to freeze
**File**: `apps/ui4/hooks/use-vector-databases.ts:40-43`

### How to Test:
1. Navigate to http://localhost:3001/vector-databases in FRESH browser (clear cache!)
2. **Expected**: Page loads within 2-3 seconds WITHOUT freezing
3. **Expected**: Can interact with page (click, scroll)
4. **Check Console**: No warnings about "maximum update depth exceeded"

### If It Fails:
- Page will freeze and become unresponsive
- CPU usage spikes to 100%
- Console shows repeated render warnings
- → Report: "BUG #3 NOT FIXED - Page still freezes"

---

## BUG #4 Verification: Database Description Field

**What was fixed**: Description parameter now saves correctly
**File**: `packages/sdk-core-mock/src/managers/VectorRAGManager.mock.ts:55-84`

### How to Test:
1. On Vector Databases page, click "+ New Database"
2. Fill form:
   - Name: `Bug Test Database`
   - Description: `Testing bug fix for description field`
3. Submit form
4. **Expected**: Database created successfully
5. Click on the new database to view details
6. **Expected**: Description shows `Testing bug fix for description field`

### Verify in Console:
```javascript
JSON.parse(localStorage.getItem('fabstir-mock-vector-dbs-0x1234567890ABCDEF1234567890ABCDEF12345678-Bug Test Database'))
```
**Expected**: `description` field contains the text you entered

### If It Fails:
- Description will be empty string
- localStorage check shows `description: ""`
- → Report: "BUG #4 NOT FIXED - Description not saved"

---

## BUG #6 Verification: Date Object Deserialization

**What was fixed**: Dates now deserialize as Date objects, not strings
**Files**: 
- `packages/sdk-core-mock/src/storage/MockStorage.ts:37-56`
- `apps/ui4/app/session-groups/page.tsx:39`

### CRITICAL: Must Clear localStorage First!
```javascript
localStorage.clear();
```

### How to Test:
1. After clearing localStorage, navigate to http://localhost:3001/session-groups
2. **Expected**: Page loads WITHOUT error boundary
3. **Expected**: Mock session groups appear:
   - Engineering Project
   - Product Research
   - Design Brainstorming
   - ML Model Training
   - Personal Notes

4. **Test Sorting**:
   - Select "Most Recent" from Sort dropdown
   - **Expected**: Groups sort by update time
   - **Expected**: NO console error about "getTime is not a function"

5. **Verify Date Objects in Console**:
```javascript
const groups = JSON.parse(localStorage.getItem('fabstir-mock-session-groups-0x1234567890ABCDEF1234567890ABCDEF12345678-all'));
console.log('updatedAt type:', typeof groups[0].updatedAt);
console.log('updatedAt value:', groups[0].updatedAt);
console.log('Has getTime?:', typeof groups[0].updatedAt.getTime === 'function');
```

**Expected Output**:
```
updatedAt type: object
updatedAt value: [Date object]
Has getTime?: true
```

### If It Fails:
- Error boundary shows: "b.updatedAt.getTime is not a function"
- Console check shows `updatedAt type: string`
- Dates look like: `"2025-01-12T22:30:00.000Z"` (strings)
- → Report: "BUG #6 NOT FIXED - Dates still strings, not Date objects"

---

## Quick Verification Checklist

Run these in browser console after clearing cache and localStorage:

### 1. Check Vector Databases Page Loads:
```javascript
// Navigate to /vector-databases first
console.log('Page loaded:', document.title);
console.log('Errors?', performance.getEntriesByType('resource').filter(r => r.duration > 5000));
```

### 2. Check Date Deserialization Works:
```javascript
localStorage.clear();
// Refresh page to /session-groups
// Then run:
const groups = JSON.parse(localStorage.getItem('fabstir-mock-session-groups-0x1234567890ABCDEF1234567890ABCDEF12345678-all'));
console.log('✅ BUG #6 Fixed?', groups && groups[0] && typeof groups[0].updatedAt.getTime === 'function');
```

### 3. Check Database Description Saves:
```javascript
// After creating database with description "Test"
const dbs = Object.keys(localStorage).filter(k => k.includes('vector-dbs'));
dbs.forEach(k => {
  const db = JSON.parse(localStorage.getItem(k));
  console.log(db.name, '- Description:', db.description || '(EMPTY - BUG NOT FIXED)');
});
```

---

## Reporting Results

### All Tests Pass:
```bash
curl -H "Title: Bug Verification - All Passed" \
  -d "✅ All 4 bugs verified as fixed:
- BUG #3: No infinite loop
- BUG #4: Description saves
- BUG #6: Dates are Date objects
- BUG #5: .getTime() works

Ready for continued testing." \
  https://ntfy.sh/fabstir-sdk-alignment45
```

### Any Test Fails:
```bash
curl -H "Title: Bug Verification - FAILURE" \
  -H "Priority: urgent" \
  -d "❌ BUG #X NOT FIXED

Details: [paste console output]
Steps: [what you did]
Expected: [what should happen]
Actual: [what actually happened]" \
  https://ntfy.sh/fabstir-sdk-alignment45
```

---

**End of Bug Verification Guide**
