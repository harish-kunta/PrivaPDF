/**
 * UI Integration Test for Undo/Redo with Complex User Interactions
 * Simulates real user workflows: upload PDF → draw redactions → undo/redo → draw more → etc.
 * 
 * Run with: node src/uiIntegration.test.js
 */

// Simulate the App component behavior
class PDFRedactionSimulator {
  constructor() {
    this.pages = [];
    this.currentPageIndex = 0;
    this.history = [];
    this.historyIndex = -1;
    this.pdfFile = null;
    this.pdfName = '';
    this.logs = [];
  }

  log(action, details = '') {
    const message = `  ${action}${details ? ' → ' + details : ''}`;
    this.logs.push(message);
    console.log(message);
  }

  // Simulate user uploading a PDF
  simulateUploadPDF(fileName = 'document.pdf', pageCount = 3) {
    this.log('📁 User uploads PDF', fileName);
    this.pdfFile = { name: fileName };
    this.pdfName = fileName;
    this.pages = [];
    
    for (let i = 1; i <= pageCount; i++) {
      this.pages.push({
        id: `page-${i}`,
        pageNumber: i,
        redactions: [],
        previewUrl: `mock-url-${i}`,
        width: 612,
        height: 792,
      });
    }
    
    this.currentPageIndex = 0;
    this.history = [JSON.parse(JSON.stringify(this.pages))];
    this.historyIndex = 0;
    
    this.log('PDF loaded', `${pageCount} pages, ready to edit`);
    this.printState();
  }

  // Simulate user drawing a redaction box
  simulateDrawRedaction(pageNum = 0, redactionLabel = '') {
    if (pageNum >= this.pages.length) {
      this.log('❌ Invalid page number:', pageNum);
      return;
    }

    this.currentPageIndex = pageNum;
    const redactionId = `red-${Date.now()}-${Math.random()}`;
    const redactionBox = {
      id: redactionId,
      x: Math.random() * 50 + 10,
      y: Math.random() * 50 + 10,
      width: Math.random() * 30 + 20,
      height: Math.random() * 30 + 10,
      isPreview: false,
    };

    this.pages[this.currentPageIndex].redactions.push(redactionBox);
    
    // Add to history
    const newHistory = this.history.slice(0, this.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(this.pages)));
    this.history = newHistory;
    this.historyIndex = this.history.length - 1;

    this.log('✏️  User draws redaction', `Page ${pageNum + 1} ${redactionLabel}`);
    this.printState();
  }

  // Simulate user clicking undo button
  simulateUndo() {
    if (this.historyIndex > 0) {
      this.historyIndex = Math.max(0, this.historyIndex - 1);
      this.pages = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
      this.log('↶  User clicks UNDO', `Restored to history index ${this.historyIndex}`);
      this.printState();
      return true;
    }
    this.log('↶  User clicks UNDO', 'Cannot undo (at beginning)');
    return false;
  }

  // Simulate user clicking redo button
  simulateRedo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex = Math.min(this.historyIndex + 1, this.history.length - 1);
      this.pages = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
      this.log('↷  User clicks REDO', `Restored to history index ${this.historyIndex}`);
      this.printState();
      return true;
    }
    this.log('↷  User clicks REDO', 'Cannot redo (at end)');
    return false;
  }

  // Simulate user clicking delete redaction button
  simulateDeleteRedaction(pageNum = 0, redactionIndex = 0) {
    if (pageNum >= this.pages.length || redactionIndex >= this.pages[pageNum].redactions.length) {
      this.log('❌ Invalid redaction reference');
      return;
    }

    this.currentPageIndex = pageNum;
    const redactionId = this.pages[this.currentPageIndex].redactions[redactionIndex].id;
    this.pages[this.currentPageIndex].redactions.splice(redactionIndex, 1);

    const newHistory = this.history.slice(0, this.historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(this.pages)));
    this.history = newHistory;
    this.historyIndex = this.history.length - 1;

    this.log('🗑️  User deletes redaction', `Page ${pageNum + 1}, redaction ${redactionIndex + 1}`);
    this.printState();
  }

  // Simulate user clicking on page in thumbnail
  simulateSwitchPage(pageNum) {
    if (pageNum >= this.pages.length) {
      this.log('❌ Invalid page number:', pageNum);
      return;
    }
    this.currentPageIndex = pageNum;
    this.log('📄 User clicks page thumbnail', `Page ${pageNum + 1}`);
    this.printState();
  }

  // Get current UI state
  getUIState() {
    return {
      currentPage: this.currentPageIndex + 1,
      totalPages: this.pages.length,
      redactionsOnCurrentPage: this.pages[this.currentPageIndex]?.redactions?.length || 0,
      totalRedactions: this.pages.reduce((sum, p) => sum + p.redactions.length, 0),
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1,
      historyIndex: this.historyIndex,
      historyLength: this.history.length,
    };
  }

  printState() {
    const state = this.getUIState();
    console.log(
      `    [Page ${state.currentPage}/${state.totalPages}] ` +
      `${state.redactionsOnCurrentPage} redactions | ` +
      `Total: ${state.totalRedactions} | ` +
      `History: ${state.historyIndex + 1}/${state.historyLength} | ` +
      `Undo: ${state.canUndo ? '✓' : '✗'} Redo: ${state.canRedo ? '✓' : '✗'}`
    );
  }

  // Verify state matches expected
  verify(description, expectedState) {
    const currentState = this.getUIState();
    const matches = Object.keys(expectedState).every(
      key => currentState[key] === expectedState[key]
    );

    if (matches) {
      console.log(`\n  ✅ VERIFIED: ${description}`);
      return true;
    } else {
      console.log(`\n  ❌ FAILED: ${description}`);
      console.log(`    Expected:`, expectedState);
      console.log(`    Got:     `, currentState);
      throw new Error(`State verification failed: ${description}`);
    }
  }
}

// Run comprehensive UI test
console.log('\n' + '='.repeat(70));
console.log('🧪 UI INTEGRATION TEST - Complex User Workflow with 10 Changes');
console.log('='.repeat(70));

try {
  const sim = new PDFRedactionSimulator();

  console.log('\n📋 SCENARIO: User uploads a PDF and makes complex edits\n');

  // CHANGE 1: Upload PDF
  console.log('\n[CHANGE 1] User uploads a 5-page PDF');
  console.log('-'.repeat(70));
  sim.simulateUploadPDF('contract.pdf', 5);
  sim.verify('PDF uploaded with 5 pages', {
    totalPages: 5,
    currentPage: 1,
    totalRedactions: 0,
    canUndo: false,
    canRedo: false,
  });

  // CHANGE 2: Draw first redaction on page 1
  console.log('\n[CHANGE 2] User draws first redaction on page 1');
  console.log('-'.repeat(70));
  sim.simulateDrawRedaction(0, '(Personal data)');
  sim.verify('First redaction added', {
    totalRedactions: 1,
    redactionsOnCurrentPage: 1,
    canUndo: true,
    canRedo: false,
    historyLength: 2,
  });

  // CHANGE 3: Draw second redaction on page 1
  console.log('\n[CHANGE 3] User draws second redaction on same page');
  console.log('-'.repeat(70));
  sim.simulateDrawRedaction(0, '(Email address)');
  sim.verify('Two redactions on page 1', {
    totalRedactions: 2,
    redactionsOnCurrentPage: 2,
    canUndo: true,
    canRedo: false,
    historyLength: 3,
  });

  // CHANGE 4: Switch to page 3 and draw redaction
  console.log('\n[CHANGE 4] User switches to page 3 and draws redaction');
  console.log('-'.repeat(70));
  sim.simulateSwitchPage(2);
  sim.simulateDrawRedaction(2, '(Phone number)');
  sim.verify('Redaction on page 3', {
    totalRedactions: 3,
    currentPage: 3,
    redactionsOnCurrentPage: 1,
    canUndo: true,
    canRedo: false,
    historyLength: 4,
  });

  // CHANGE 5: Undo - should go back to page 1 state with 2 redactions
  console.log('\n[CHANGE 5] User clicks UNDO');
  console.log('-'.repeat(70));
  sim.simulateUndo();
  sim.verify('Undo removes page 3 redaction', {
    totalRedactions: 2,
    canUndo: true,
    canRedo: true,
    historyLength: 4,
    historyIndex: 2,
  });

  // CHANGE 6: Undo again - should have 1 redaction on page 1
  console.log('\n[CHANGE 6] User clicks UNDO again');
  console.log('-'.repeat(70));
  sim.simulateUndo();
  sim.simulateSwitchPage(0); // Switch to page 1 to see the redactions
  sim.verify('Undo removes second redaction from page 1', {
    totalRedactions: 1,
    redactionsOnCurrentPage: 1,
    canUndo: true,
    canRedo: true,
    historyIndex: 1,
  });

  // CHANGE 7: Redo - should restore to 2 redactions
  console.log('\n[CHANGE 7] User clicks REDO');
  console.log('-'.repeat(70));
  sim.simulateRedo();
  sim.verify('Redo restores second redaction', {
    totalRedactions: 2,
    redactionsOnCurrentPage: 2,
    canUndo: true,
    canRedo: true,
    historyIndex: 2,
  });

  // CHANGE 8: Make new edit (should clear redo history)
  console.log('\n[CHANGE 8] User draws new redaction after undo/redo (clears redo history)');
  console.log('-'.repeat(70));
  sim.simulateSwitchPage(1);
  sim.simulateDrawRedaction(1, '(Social security)');
  sim.verify('New edit clears redo history', {
    totalRedactions: 3,
    currentPage: 2,
    canUndo: true,
    canRedo: false,
    historyLength: 4, // Should be trimmed to current index + new state
  });

  // CHANGE 9: Delete a redaction
  console.log('\n[CHANGE 9] User deletes a redaction from page 1');
  console.log('-'.repeat(70));
  sim.simulateSwitchPage(0);
  sim.simulateDeleteRedaction(0, 0);
  sim.verify('Redaction deleted from page 1', {
    totalRedactions: 2,
    redactionsOnCurrentPage: 1,
    canUndo: true,
    canRedo: false,
  });

  // CHANGE 10: Undo deletion - should restore redaction
  console.log('\n[CHANGE 10] User clicks UNDO to restore deleted redaction');
  console.log('-'.repeat(70));
  sim.simulateUndo();
  sim.verify('Undo restores deleted redaction', {
    totalRedactions: 3,
    redactionsOnCurrentPage: 2,
    canUndo: true,
    canRedo: true,
    historyIndex: 3,
  });

  // Final verification
  console.log('\n' + '='.repeat(70));
  console.log('🎯 FINAL STATE VERIFICATION');
  console.log('='.repeat(70));
  const finalState = sim.getUIState();
  console.log(`\n  ✅ Total Redactions: ${finalState.totalRedactions}`);
  console.log(`  ✅ Pages: ${finalState.currentPage}/${finalState.totalPages}`);
  console.log(`  ✅ History Depth: ${finalState.historyIndex + 1}/${finalState.historyLength}`);
  console.log(`  ✅ Can Undo: ${finalState.canUndo}`);
  console.log(`  ✅ Can Redo: ${finalState.canRedo}`);

  console.log('\n' + '='.repeat(70));
  console.log('✅ ALL UI TESTS PASSED! Undo/Redo works correctly through 10 edits!');
  console.log('='.repeat(70) + '\n');

} catch (error) {
  console.log('\n' + '='.repeat(70));
  console.log('❌ TEST FAILED!');
  console.log('='.repeat(70));
  console.error('\n' + error.message + '\n');
  process.exit(1);
}
