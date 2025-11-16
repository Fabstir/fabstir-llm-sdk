# Manual Testing Checklist: Deferred Embeddings

**Test Date**: _______________
**Tester**: _______________
**UI5 Version**: _______________
**Environment**: http://localhost:3002

---

## Pre-Test Setup

- [ ] UI5 application running on port 3002
- [ ] Wallet connected (MetaMask or test wallet)
- [ ] Browser DevTools console open for error monitoring
- [ ] Clear any existing test data (optional)

---

## Test 1: Upload Documents

**Goal**: Verify documents upload with "pending embeddings" status

### Steps:

1. - [ ] Navigate to Vector Databases page
2. - [ ] Create a new test database (name: `manual-test-{timestamp}`)
3. - [ ] Click into the database
4. - [ ] Click "Upload" button
5. - [ ] Upload 5 test documents (.txt files, 1-2 KB each)

### Expected Results:

- [ ] All 5 documents appear in document list
- [ ] Each document shows "Pending Embeddings" badge (yellow)
- [ ] File names are correct
- [ ] File sizes are displayed
- [ ] Upload timestamp shows "X seconds/minutes ago"

### Actual Results:

```
Document 1: _______________
Document 2: _______________
Document 3: _______________
Document 4: _______________
Document 5: _______________
```

### Pass/Fail: ⬜ PASS  ⬜ FAIL

**Notes**: _______________

---

## Test 2: Semantic Search Disabled State

**Goal**: Verify semantic search is disabled when no ready documents exist

### Steps:

1. - [ ] Scroll to "Semantic Search" section
2. - [ ] Read the disabled message

### Expected Results:

- [ ] Semantic Search section shows disabled state
- [ ] Message reads: "Upload and vectorize documents to enable semantic search..."
- [ ] No search input field visible
- [ ] AlertCircle icon displayed

### Pass/Fail: ⬜ PASS  ⬜ FAIL

**Notes**: _______________

---

## Test 3: Start Chat Session

**Goal**: Trigger background embedding generation

### Steps:

1. - [ ] Navigate to Session Groups
2. - [ ] Create new session group (name: `test-session-{timestamp}`)
3. - [ ] Open the session group
4. - [ ] Link the vector database created in Test 1
5. - [ ] Type a message: "Hello, this is a test"
6. - [ ] Send the message

### Expected Results:

- [ ] Session starts successfully
- [ ] Progress bar appears within 5 seconds
- [ ] Progress bar title: "Generating embeddings" or similar

### Actual Results:

```
Progress bar appeared: ⬜ Yes  ⬜ No
Time to appear: _______________ seconds
```

### Pass/Fail: ⬜ PASS  ⬜ FAIL

**Notes**: _______________

---

## Test 4: Progress Bar Display

**Goal**: Verify progress bar shows correct information

### Steps:

1. - [ ] Observe progress bar during embedding generation
2. - [ ] Note document names shown
3. - [ ] Note percentage progress

### Expected Results:

- [ ] Progress bar displays current document name
- [ ] Percentage shows (e.g., "Document 1 of 5: 20%")
- [ ] Progress bar updates for each document
- [ ] Documents transition: pending → processing → ready
- [ ] No console errors during processing

### Actual Results:

```
Document 1 name: _______________  Progress: ___%
Document 2 name: _______________  Progress: ___%
Document 3 name: _______________  Progress: ___%
Document 4 name: _______________  Progress: ___%
Document 5 name: _______________  Progress: ___%
```

### Pass/Fail: ⬜ PASS  ⬜ FAIL

**Notes**: _______________

---

## Test 5: Progress Bar Auto-Hide

**Goal**: Verify progress bar disappears when complete

### Steps:

1. - [ ] Wait for all embeddings to complete
2. - [ ] Observe progress bar behavior

### Expected Results:

- [ ] Progress bar auto-hides when all documents ready
- [ ] Total processing time < 30 seconds per document
- [ ] No lingering UI elements

### Actual Results:

```
Total time: _______________ seconds
Average per document: _______________ seconds
Progress bar hidden: ⬜ Yes  ⬜ No
```

### Pass/Fail: ⬜ PASS  ⬜ FAIL

**Notes**: _______________

---

## Test 6: Document Status Update

**Goal**: Verify documents show "ready" status after embeddings complete

### Steps:

1. - [ ] Navigate back to Vector Databases
2. - [ ] Open the test database
3. - [ ] Check document status badges

### Expected Results:

- [ ] "Pending Embeddings" badges no longer visible
- [ ] Documents show vector count badges (green)
- [ ] Example: "5 vectors" or "ready" badge
- [ ] All 5 documents show ready status

### Actual Results:

```
Document 1 status: _______________
Document 2 status: _______________
Document 3 status: _______________
Document 4 status: _______________
Document 5 status: _______________
```

### Pass/Fail: ⬜ PASS  ⬜ FAIL

**Notes**: _______________

---

## Test 7: Semantic Search Enabled

**Goal**: Verify semantic search becomes available after embeddings complete

### Steps:

1. - [ ] Scroll to "Semantic Search" section
2. - [ ] Verify search input is now visible
3. - [ ] Enter search query: "test document"
4. - [ ] Click "Search" button

### Expected Results:

- [ ] Disabled message is hidden
- [ ] Search input placeholder: "Ask a question about your documents..."
- [ ] Search button is enabled
- [ ] Search executes without errors
- [ ] Results appear within 2 seconds

### Actual Results:

```
Search input visible: ⬜ Yes  ⬜ No
Results found: _______________ documents
Search time: _______________ seconds
```

### Pass/Fail: ⬜ PASS  ⬜ FAIL

**Notes**: _______________

---

## Test 8: Failed Embedding Scenario (Optional)

**Goal**: Test error handling and retry functionality

### Steps:

1. - [ ] Upload a new document
2. - [ ] Simulate failure (disconnect network during processing)
3. - [ ] Verify "failed" status appears
4. - [ ] Look for retry button

### Expected Results:

- [ ] Document shows "Failed" badge (red)
- [ ] Retry button appears (RotateCw icon)
- [ ] Clicking retry re-processes the document
- [ ] Error message is helpful

### Actual Results:

```
Failed status shown: ⬜ Yes  ⬜ No
Retry button present: ⬜ Yes  ⬜ No
Retry successful: ⬜ Yes  ⬜ No
Error message: _______________
```

### Pass/Fail: ⬜ PASS  ⬜ FAIL

**Notes**: _______________

---

## Test 9: Text Filtering

**Goal**: Verify filename filtering works independently

### Steps:

1. - [ ] In document list, find search/filter input
2. - [ ] Type a filename fragment (e.g., "test")
3. - [ ] Observe filtered results

### Expected Results:

- [ ] Placeholder text: "Type to filter by filename..."
- [ ] Tooltip: "Text-based filtering. Semantic search available after embeddings complete."
- [ ] Results update as you type
- [ ] Case-insensitive filtering
- [ ] Shows "Showing X of Y files" count

### Actual Results:

```
Filter input found: ⬜ Yes  ⬜ No
Filtering worked: ⬜ Yes  ⬜ No
Case insensitive: ⬜ Yes  ⬜ No
File count display: _______________
```

### Pass/Fail: ⬜ PASS  ⬜ FAIL

**Notes**: _______________

---

## Test 10: Performance Benchmarks

**Goal**: Verify acceptable performance

### Steps:

1. - [ ] Measure upload time for 1 document
2. - [ ] Measure embedding generation time for 1 document
3. - [ ] Measure semantic search time

### Target Benchmarks:

- Upload: < 2 seconds per document
- Embedding generation: < 30 seconds per document
- Semantic search: < 2 seconds

### Actual Results:

```
Upload time: _______________ seconds (Target: < 2s)
Embedding time: _______________ seconds (Target: < 30s)
Search time: _______________ seconds (Target: < 2s)
```

### Pass/Fail: ⬜ PASS  ⬜ FAIL

**Notes**: _______________

---

## Console Errors Check

**Goal**: Ensure no errors during normal operation

### Check console for:

- [ ] No errors during upload
- [ ] No errors during embedding generation
- [ ] No errors during search
- [ ] No warnings about missing dependencies
- [ ] No CORS errors
- [ ] No S5 storage errors

### Errors Found:

```
_______________
_______________
_______________
```

### Pass/Fail: ⬜ PASS  ⬜ FAIL

---

## Overall Test Summary

**Total Tests**: 10
**Passed**: ___ / 10
**Failed**: ___ / 10
**Skipped**: ___ / 10

**Overall Status**: ⬜ PASS  ⬜ FAIL

**Blocker Issues**:
```
_______________
_______________
```

**Minor Issues**:
```
_______________
_______________
```

**Recommendations**:
```
_______________
_______________
```

**Sign-off**: _______________
**Date**: _______________
