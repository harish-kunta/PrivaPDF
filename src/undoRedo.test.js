/**
 * Test file for Undo/Redo behavior
 * This tests the core logic of history management
 * 
 * Run this with: node src/undoRedo.test.js
 */

// Simulated state management for testing
class HistoryManager {
  constructor() {
    this.history = [];
    this.historyIndex = -1;
  }

  addToHistory(newPages) {
    // Trim history to current index (remove any redo history if we made a new edit)
    const trimmedHistory = this.history.slice(0, this.historyIndex + 1);
    // Deep clone and add new state
    trimmedHistory.push(JSON.parse(JSON.stringify(newPages)));
    this.history = trimmedHistory;
    this.historyIndex = this.history.length - 1;
    return {
      history: this.history,
      historyIndex: this.historyIndex
    };
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex = Math.max(0, this.historyIndex - 1);
    }
    return {
      currentState: this.history[this.historyIndex],
      historyIndex: this.historyIndex,
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1
    };
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex = Math.min(this.historyIndex + 1, this.history.length - 1);
    }
    return {
      currentState: this.history[this.historyIndex],
      historyIndex: this.historyIndex,
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1
    };
  }

  getCurrentState() {
    return this.history[this.historyIndex];
  }
}

// Test helpers
function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ FAILED: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

// Run tests
console.log('\n🧪 Testing Undo/Redo Logic\n');
console.log('='.repeat(50));

try {
  // Test 1: Initial state
  console.log('\nTest 1: Initial state');
  const manager = new HistoryManager();
  assert(manager.historyIndex === -1, 'Initial historyIndex should be -1');
  assert(manager.history.length === 0, 'Initial history should be empty');
  console.log('   History: empty, Index: -1');

  // Test 2: Add first edit (redaction)
  console.log('\nTest 2: Add first redaction');
  const edit1 = { pageIndex: 0, redactions: [{ id: 'red-1', x: 10, y: 20 }] };
  manager.addToHistory([edit1]);
  assert(manager.historyIndex === 0, 'After first edit, historyIndex should be 0');
  assert(manager.history.length === 1, 'History length should be 1');
  assert(JSON.stringify(manager.getCurrentState()) === JSON.stringify([edit1]), 'First state should match');
  console.log('   History: 1 item, Index: 0');

  // Test 3: Add second edit
  console.log('\nTest 3: Add second redaction');
  const edit2 = { pageIndex: 0, redactions: [{ id: 'red-1', x: 10, y: 20 }, { id: 'red-2', x: 30, y: 40 }] };
  manager.addToHistory([edit2]);
  assert(manager.historyIndex === 1, 'After second edit, historyIndex should be 1');
  assert(manager.history.length === 2, 'History length should be 2');
  console.log('   History: 2 items, Index: 1');

  // Test 4: Add third edit
  console.log('\nTest 4: Add third redaction');
  const edit3 = { pageIndex: 0, redactions: [{ id: 'red-1', x: 10, y: 20 }, { id: 'red-2', x: 30, y: 40 }, { id: 'red-3', x: 50, y: 60 }] };
  manager.addToHistory([edit3]);
  assert(manager.historyIndex === 2, 'After third edit, historyIndex should be 2');
  assert(manager.history.length === 3, 'History length should be 3');
  console.log('   History: 3 items, Index: 2');

  // Test 5: Undo once - should go back to edit 2
  console.log('\nTest 5: Undo once');
  const undoResult1 = manager.undo();
  assert(manager.historyIndex === 1, 'After 1st undo, historyIndex should be 1');
  assert(undoResult1.canUndo === true, 'canUndo should be true');
  assert(undoResult1.canRedo === true, 'canRedo should be true');
  assert(JSON.stringify(undoResult1.currentState) === JSON.stringify([edit2]), 'Should restore to edit 2');
  console.log('   Index: 1, canUndo: true, canRedo: true');

  // Test 6: Undo twice - should go back to edit 1
  console.log('\nTest 6: Undo twice');
  const undoResult2 = manager.undo();
  assert(manager.historyIndex === 0, 'After 2nd undo, historyIndex should be 0');
  assert(undoResult2.canUndo === false, 'canUndo should be false (at start)');
  assert(undoResult2.canRedo === true, 'canRedo should be true');
  assert(JSON.stringify(undoResult2.currentState) === JSON.stringify([edit1]), 'Should restore to edit 1');
  console.log('   Index: 0, canUndo: false, canRedo: true');

  // Test 7: Try to undo at beginning - should stay at index 0
  console.log('\nTest 7: Try to undo at beginning (should not go negative)');
  const undoResult3 = manager.undo();
  assert(manager.historyIndex === 0, 'historyIndex should stay at 0');
  assert(undoResult3.canUndo === false, 'canUndo should remain false');
  console.log('   Index: 0 (unchanged), canUndo: false');

  // Test 8: Redo once - should go forward to edit 2
  console.log('\nTest 8: Redo once');
  const redoResult1 = manager.redo();
  assert(manager.historyIndex === 1, 'After 1st redo, historyIndex should be 1');
  assert(redoResult1.canUndo === true, 'canUndo should be true');
  assert(redoResult1.canRedo === true, 'canRedo should be true');
  assert(JSON.stringify(redoResult1.currentState) === JSON.stringify([edit2]), 'Should restore to edit 2');
  console.log('   Index: 1, canUndo: true, canRedo: true');

  // Test 9: Redo twice - should go forward to edit 3
  console.log('\nTest 9: Redo twice');
  const redoResult2 = manager.redo();
  assert(manager.historyIndex === 2, 'After 2nd redo, historyIndex should be 2');
  assert(redoResult2.canUndo === true, 'canUndo should be true');
  assert(redoResult2.canRedo === false, 'canRedo should be false (at end)');
  assert(JSON.stringify(redoResult2.currentState) === JSON.stringify([edit3]), 'Should restore to edit 3');
  console.log('   Index: 2, canUndo: true, canRedo: false');

  // Test 10: Try to redo at end - should stay at index 2
  console.log('\nTest 10: Try to redo at end (should not exceed length)');
  const redoResult3 = manager.redo();
  assert(manager.historyIndex === 2, 'historyIndex should stay at 2');
  assert(redoResult3.canRedo === false, 'canRedo should remain false');
  console.log('   Index: 2 (unchanged), canRedo: false');

  // Test 11: Edit after undo - should clear redo history
  console.log('\nTest 11: Make edit after undo (should clear redo history)');
  manager.undo();  // Go back to index 1
  assert(manager.historyIndex === 1, 'historyIndex should be 1');
  const edit4 = { pageIndex: 0, redactions: [{ id: 'red-1' }, { id: 'red-2' }, { id: 'red-100' }] };
  manager.addToHistory([edit4]);
  assert(manager.historyIndex === 2, 'After new edit, historyIndex should be 2');
  assert(manager.history.length === 3, 'History length should be 3 (edit3 removed)');
  assert(JSON.stringify(manager.getCurrentState()) === JSON.stringify([edit4]), 'Current state should be new edit');
  const redoAfterEdit = manager.redo();
  assert(redoAfterEdit.canRedo === false, 'canRedo should be false (no history forward)');
  console.log('   Index: 2, History: 3 items, canRedo: false');

  // Test 12: Multiple undo/redo cycles
  console.log('\nTest 12: Multiple undo/redo cycles');
  manager.undo();
  manager.undo();
  assert(manager.historyIndex === 0, 'After 2 undos, index should be 0');
  manager.redo();
  manager.redo();
  assert(manager.historyIndex === 2, 'After 2 redos, index should be 2');
  manager.undo();
  assert(manager.historyIndex === 1, 'After 1 undo, index should be 1');
  manager.redo();
  assert(manager.historyIndex === 2, 'After 1 redo, index should be 2');
  console.log('   Cycled through multiple undo/redo operations');

  console.log('\n' + '='.repeat(50));
  console.log('\n✅ All tests passed! Undo/Redo logic is working correctly.\n');

} catch (error) {
  console.error('\n' + error.message);
  console.log('\n' + '='.repeat(50));
  console.log('\n❌ Tests failed!\n');
  process.exit(1);
}
