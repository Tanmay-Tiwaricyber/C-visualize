/**
 * Learn mode: structured lessons that reuse the same engine.
 * Each lesson can load its program into the editor and run it.
 */

import { iconSvg } from './icons.js';
import { highlightC } from './editor.js';

const lesson = (id, level, title, body) => ({ id, level, title, ...body });

export const LESSONS = [
  lesson('structure', 'Beginner', 'Structure of a C program', {
    concept: `
      <p>Every C program is built from <strong>functions</strong>. Execution always starts at <code>main</code>.</p>
      <ul>
        <li><code>#include &lt;stdio.h&gt;</code> pulls in declarations for input and output.</li>
        <li><code>int main(void)</code> is the entry point. The <code>int</code> is the value returned to the operating system.</li>
        <li>Statements end with a semicolon; blocks are wrapped in braces.</li>
        <li><code>return 0;</code> means "finished successfully".</li>
      </ul>`,
    code: `#include <stdio.h>

int main(void) {
    printf("Line one\\n");
    printf("Line two\\n");
    return 0;
}
`,
    expected: 'Line one\nLine two',
    steps: [
      'Press Run, then step with ] — the highlighted line is the exact statement the debugger is stopped on.',
      'The flowchart node for each printf becomes active as the cursor reaches it.',
      'The Output tab only shows a line once the cursor passes the printf that produced it.',
    ],
    mistakes: [
      'Writing <code>void main()</code> — most compilers accept it, but the standard signature is <code>int main(void)</code>.',
      'Forgetting <code>#include &lt;stdio.h&gt;</code>: you will see "implicit declaration of printf".',
    ],
    challenge: 'Add a third printf that prints your name, and check that the trace grows by exactly one step.',
  }),

  lesson('variables', 'Beginner', 'Variables and data types', {
    concept: `
      <p>A variable is a named box in memory. Its type fixes how many bytes it occupies and how those bytes are interpreted.</p>
      <ul>
        <li><code>int</code> — whole numbers (usually 4 bytes)</li>
        <li><code>float</code>, <code>double</code> — real numbers</li>
        <li><code>char</code> — a single character / small integer</li>
      </ul>
      <p>Declaring a variable does <em>not</em> initialise it. Reading it before assignment gives an indeterminate value — the inspector shows "—" until the declaration line executes.</p>`,
    code: `#include <stdio.h>

int main(void) {
    int count = 3;
    double price = 19.5;
    char grade = 'A';

    printf("count = %d\\n", count);
    printf("price = %.2f\\n", price);
    printf("grade = %c\\n", grade);
    return 0;
}
`,
    expected: 'count = 3\nprice = 19.50\ngrade = A',
    steps: [
      'Watch each variable appear in the Variables tab immediately after its declaration line runs.',
      'The address column shows where each variable lives on the stack.',
      'Use "Previous step" to see the value disappear again — the trace is exact, not a re-run.',
    ],
    mistakes: [
      'Using <code>%d</code> for a <code>double</code>: use <code>%f</code> (and <code>%.2f</code> to round).',
      'Assuming <code>int</code> is always 4 bytes — the standard only guarantees a minimum size.',
    ],
    challenge: 'Add a variable that stores your age, print it, and check its byte address in the inspector.',
  }),

  lesson('io', 'Beginner', 'Input and output', {
    concept: `
      <p><code>printf</code> writes formatted text; <code>scanf</code> reads values into addresses.</p>
      <p><code>scanf("%d", &amp;n)</code> needs the <em>address</em> of <code>n</code>, because it must modify the variable.</p>
      <p>In this laboratory the program's standard input is fixed before the run: put values in the <strong>Input</strong> tab.</p>`,
    code: `#include <stdio.h>

int main(void) {
    int a = 0;
    int b = 0;

    printf("Enter two numbers: ");
    scanf("%d %d", &a, &b);
    printf("Sum = %d\\n", a + b);
    return 0;
}
`,
    stdin: '12 30\n',
    expected: 'Enter two numbers: Sum = 42',
    steps: [
      'Open the Input tab first — the value "12 30" is supplied to the program at start-up.',
      'Notice that printf output can appear before the value is read; the console follows the cursor.',
    ],
    mistakes: [
      'Writing <code>scanf("%d", n)</code> instead of <code>&amp;n</code> — the program will crash.',
      'Forgetting that <code>scanf</code> stops at whitespace.',
    ],
    challenge: 'Read three numbers and print their average with two decimal places.',
  }),

  lesson('conditionals', 'Beginner', 'Conditional statements', {
    concept: `
      <p><code>if</code> runs a block when a condition is non-zero. <code>else</code> handles the other case; <code>else if</code> chains tests.</p>
      <p>The flowchart shows the decision as a hexagon, and the edge labels show which branch the program really took.</p>`,
    code: `#include <stdio.h>

int main(void) {
    int score = 78;

    if (score >= 90) {
        printf("Grade A\\n");
    } else if (score >= 75) {
        printf("Grade B\\n");
    } else {
        printf("Grade C\\n");
    }

    return 0;
}
`,
    expected: 'Grade B',
    steps: [
      'Step until the highlighted line is the first if. Only one branch node will appear in the flowchart.',
      'The branch that was not taken produced no nodes — the graph shows what executed, not what could have.',
    ],
    mistakes: [
      'Using <code>=</code> instead of <code>==</code> inside a condition: that is an assignment.',
      'Forgetting braces when adding a second statement to a branch.',
    ],
    challenge: 'Change the score to 95, re-run, and compare the flowchart with the previous run.',
  }),

  lesson('loops', 'Beginner', 'Loops', {
    concept: `
      <p><code>for (init; condition; update)</code> is the counted loop. <code>while</code> checks first, <code>do ... while</code> checks after the body.</p>
      <p>Watch the loop counter variable in the inspector: it changes once per iteration, and the back edge in the flowchart counts traversals.</p>`,
    code: `#include <stdio.h>

int main(void) {
    int n = 5;
    int total = 0;
    int i;

    for (i = 1; i <= n; i++) {
        total += i;
    }

    printf("1 + ... + %d = %d\\n", n, total);
    return 0;
}
`,
    expected: '1 + ... + 5 = 15',
    steps: [
      'Step to the for line and press ] repeatedly: i increases 1, 2, 3, 4, 5, then the loop exits.',
      'Play the trace at 2× to see the whole accumulation.',
    ],
    mistakes: [
      'Off-by-one: <code>i &lt; n</code> instead of <code>i &lt;= n</code>.',
      'Forgetting the update clause, which creates an infinite loop (this laboratory stops at the step limit).',
    ],
    challenge: 'Sum only the even numbers from 1 to 20.',
  }),

  lesson('functions', 'Intermediate', 'Functions and call by value', {
    concept: `
      <p>A function call creates a new <strong>stack frame</strong>. Arguments are copied into parameters — this is <em>call by value</em>.</p>
      <p>Changing a parameter inside the function never changes the caller's variable. Pass an address (<code>&amp;x</code>) when you need to modify it.</p>`,
    code: `#include <stdio.h>

int square(int value) {
    int result = value * value;
    return result;
}

int main(void) {
    int number = 6;
    int answer = square(number);

    printf("%d squared is %d\\n", number, answer);
    return 0;
}
`,
    expected: '6 squared is 36',
    steps: [
      'Step into the call: the Call stack panel gains a frame and the Variables tab switches to the callee.',
      'Step out returns to main and the frame disappears again.',
    ],
    mistakes: [
      'Forgetting the return statement: the caller receives garbage.',
      'Declaring the function after main without a prototype.',
    ],
    challenge: 'Write a function <code>max3</code> that returns the largest of three integers.',
  }),

  lesson('recursion', 'Intermediate', 'Recursion', {
    concept: `
      <p>A recursive function calls itself with a smaller input. The <strong>base case</strong> stops the recursion.</p>
      <p>Each call keeps its own frame, so <code>n</code> has a different value in every frame. Returns unwind from the deepest frame back to the first.</p>`,
    code: `#include <stdio.h>

long factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main(void) {
    int n = 5;
    long result = factorial(n);
    printf("%d! = %ld\\n", n, result);
    return 0;
}
`,
    expected: '5! = 120',
    steps: [
      'Open the Call stack panel and step slowly: the same function appears several times with different n values.',
      'After the base case returns, frames pop one by one — the "returned to" events in the history.',
    ],
    mistakes: [
      'Missing or unreachable base case — the program exhausts the stack (this laboratory reports a signal).',
      'Using recursion where a loop would be simpler and faster.',
    ],
    challenge: 'Write a recursive function that computes the sum of digits of a number.',
  }),

  lesson('arrays', 'Intermediate', 'Arrays', {
    concept: `
      <p>An array is a contiguous block of elements of one type. <code>values[i]</code> means "the element <code>i</code> steps from the base address".</p>
      <p>The Arrays &amp; pointers panel shows every element and highlights the ones that changed at this step.</p>`,
    code: `#include <stdio.h>

int main(void) {
    int values[6] = {4, 8, 15, 16, 23, 42};
    int i;
    int total = 0;

    for (i = 0; i < 6; i++) {
        total += values[i];
    }

    printf("Sum = %d\\n", total);
    return 0;
}
`,
    expected: 'Sum = 108',
    steps: ['Watch the index variable i track the highlighted cell.', 'The array address is the address of values[0].'],
    mistakes: [
      'Looping to <code>i &lt;= 6</code>: that reads one element past the end (undefined behaviour).',
      'Assuming C checks array bounds — it does not.',
    ],
    challenge: 'Find the largest element and print its index.',
  }),

  lesson('pointers', 'Intermediate', 'Pointers', {
    concept: `
      <p>A pointer holds an address. <code>&amp;x</code> takes an address, <code>*p</code> reads or writes through it.</p>
      <p>In the Memory panel, a pointer row shows the stored address and the object it references.</p>`,
    code: `#include <stdio.h>

int main(void) {
    int value = 10;
    int *pointer = &value;

    *pointer = 25;
    printf("value = %d\\n", value);
    return 0;
}
`,
    expected: 'value = 25',
    steps: [
      'Compare the "Address" column of value with the value stored in pointer — they are identical.',
      'After the assignment through pointer, the Variables tab flags value as changed.',
    ],
    mistakes: [
      'Dereferencing an uninitialised or NULL pointer (this crashes the program).',
      'Confusing the pointer itself with the value it points at.',
    ],
    challenge: 'Use two pointers to swap two integers without a third variable.',
  }),

  lesson('sorting', 'Intermediate', 'Searching and sorting', {
    concept: `
      <p>Bubble sort repeatedly compares neighbours and swaps them when they are out of order. After each pass the largest remaining value is in place.</p>
      <p>Linear search checks each element; binary search halves the remaining range but needs sorted input.</p>`,
    code: `#include <stdio.h>

int main(void) {
    int values[7] = {29, 10, 14, 37, 13, 5, 22};
    int n = 7;
    int i, j, temp;

    for (i = 0; i < n - 1; i++) {
        for (j = 0; j < n - i - 1; j++) {
            if (values[j] > values[j + 1]) {
                temp = values[j];
                values[j] = values[j + 1];
                values[j + 1] = temp;
            }
        }
    }

    for (i = 0; i < n; i++) {
        printf("%d ", values[i]);
    }
    printf("\\n");
    return 0;
}
`,
    expected: '5 10 13 14 22 29 37',
    steps: [
      'Use the Arrays & pointers panel: changed cells flash amber as swaps happen.',
      'The comparison counter in that panel increases only on lines that compare values.',
    ],
    mistakes: [
      'Wrong inner bound (<code>n</code> instead of <code>n - i - 1</code>) causing extra comparisons.',
      'Forgetting to reset <code>j</code> between passes.',
    ],
    challenge: 'Count how many swaps bubble sort performs for this input.',
  }),

  lesson('memory', 'Advanced', 'Dynamic memory allocation', {
    concept: `
      <p><code>malloc</code> asks the heap for bytes and returns a pointer, or <code>NULL</code> on failure. <code>free</code> releases the block.</p>
      <p>Using memory after <code>free</code>, writing past the end of a block, or losing the only pointer (a leak) are undefined behaviour. Turn on <strong>Sanitizers</strong> to have AddressSanitizer and UBSan report them.</p>`,
    code: `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int n = 5;
    int *values = malloc(n * sizeof(int));
    int i;

    if (values == NULL) {
        return 1;
    }

    for (i = 0; i < n; i++) {
        values[i] = (i + 1) * 10;
    }

    printf("values[4] = %d\\n", values[4]);
    free(values);
    values = NULL;
    return 0;
}
`,
    expected: 'values[4] = 50',
    steps: [
      'The Memory panel reports heap tracking as unavailable — it does not invent block sizes.',
      'Enable Sanitizers and run the "Heap overflow" example to see a real AddressSanitizer report with the exact source line.',
    ],
    mistakes: [
      'Not checking for NULL after malloc.',
      'Freeing the same pointer twice (double free).',
      'Leaking memory by overwriting the last pointer to a block.',
    ],
    challenge: 'Deliberately leak two blocks, then catch the leak with Sanitizers enabled.',
  }),

  lesson('debugging', 'Advanced', 'Debugging techniques', {
    concept: `
      <p>Systematic debugging beats guessing: reproduce, isolate, observe, fix, verify.</p>
      <ul>
        <li>Read the compiler diagnostics — they name the line and the rule.</li>
        <li>Set breakpoints on interesting lines and step one statement at a time.</li>
        <li>Check every variable after each step instead of assuming.</li>
        <li>Turn on sanitizers for memory and undefined-behaviour bugs.</li>
      </ul>`,
    code: `#include <stdio.h>

int main(void) {
    int values[5] = {3, 9, 4, 8, 2};
    int i;
    int total = 0;

    for (i = 0; i <= 5; i++) {   /* bug: one iteration too many */
        total += values[i];
    }

    printf("Total = %d\\n", total);
    return 0;
}
`,
    expected: 'Depends on the out-of-bounds value — the point is to catch the bug.',
    steps: [
      'Click the gutter next to the loop line to set a breakpoint, then step and watch i reach 5.',
      'Turn on Sanitizers and run again: the Runtime tab reports the out-of-bounds read with its line number.',
    ],
    mistakes: [
      'Only testing the happy path.',
      'Ignoring warnings — <code>-Wall -Wextra</code> is enabled here for a reason.',
    ],
    challenge: 'Fix the loop, then explain why the buggy version sometimes prints the right answer.',
  }),
];

export class LearnDrawer {
  constructor(root, options = {}) {
    this.root = root;
    this.onClose = options.onClose || (() => {});
    this.onLoad = options.onLoad || (() => {});
    this.onRun = options.onRun || (() => {});
    this.currentId = LESSONS[0].id;
  }

  open(lessonId) {
    if (lessonId) this.currentId = lessonId;
    this.root.hidden = false;
    this.render();
  }

  close() {
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.onClose();
  }

  render() {
    const lesson = LESSONS.find((item) => item.id === this.currentId) || LESSONS[0];
    const levels = ['Beginner', 'Intermediate', 'Advanced'];
    this.root.innerHTML = `
      <div class="drawer" role="dialog" aria-modal="true" aria-label="Learn mode">
        <div class="drawer-header">
          ${iconSvg('graduation')}
          <div>
            <div class="modal-title">Learn mode</div>
            <div class="panel-sub">Concepts, runnable examples and guided traces</div>
          </div>
          <span class="grow"></span>
          <span class="tag" data-tone="blue">${LESSONS.length} lessons</span>
          <button class="btn btn-icon btn-ghost" data-learn-close aria-label="Close learn mode">${iconSvg('close')}</button>
        </div>
        <div class="drawer-body">
          <nav class="lesson-nav">
            ${levels
              .map((level) => {
                const items = LESSONS.filter((item) => item.level === level);
                return `
                  <div class="lesson-group">
                    <div class="lesson-group-title">${level}</div>
                    ${items
                      .map(
                        (item) => `
                        <button class="lesson-link" data-lesson="${item.id}" aria-current="${item.id === lesson.id}">
                          <span class="lesson-index">${String(LESSONS.indexOf(item) + 1).padStart(2, '0')}</span>
                          <span>${item.title}</span>
                        </button>`,
                      )
                      .join('')}
                  </div>`;
              })
              .join('')}
          </nav>
          <article class="lesson-content">
            <div class="lesson-kicker">${lesson.level}</div>
            <h2>${lesson.title}</h2>
            <div class="lesson-section">
              <h3>${iconSvg('book')} Concept</h3>
              ${lesson.concept}
            </div>
            <div class="lesson-section">
              <h3>${iconSvg('code')} Example program</h3>
              <div class="lesson-code"><pre><code>${highlightC(lesson.code)}</code></pre></div>
              <div class="lesson-actions">
                <button class="btn btn-primary btn-sm" data-lesson-run>${iconSvg('play')} Load and run</button>
                <button class="btn btn-outline btn-sm" data-lesson-load>${iconSvg('file-plus')} Load into editor</button>
              </div>
            </div>
            <div class="lesson-section">
              <h3>${iconSvg('terminal')} Expected result</h3>
              <pre>${lesson.expected.replace(/</g, '&lt;')}</pre>
            </div>
            <div class="lesson-section">
              <h3>${iconSvg('activity')} What to watch while stepping</h3>
              <ul>${lesson.steps.map((step) => `<li>${step}</li>`).join('')}</ul>
            </div>
            <div class="lesson-section">
              <h3>${iconSvg('warning')} Common mistakes</h3>
              <div class="mistake-list">
                ${lesson.mistakes.map((mistake) => `<div class="mistake">${iconSvg('warning')}<div>${mistake}</div></div>`).join('')}
              </div>
            </div>
            <div class="lesson-section">
              <h3>${iconSvg('target')} Practice challenge</h3>
              <div class="challenge">${lesson.challenge}</div>
            </div>
          </article>
        </div>
      </div>
    `;

    this.root.querySelector('[data-learn-close]').addEventListener('click', () => this.close());
    this.root.querySelectorAll('[data-lesson]').forEach((button) => {
      button.addEventListener('click', () => {
        this.currentId = button.dataset.lesson;
        this.render();
      });
    });
    this.root.querySelector('[data-lesson-load]').addEventListener('click', () => {
      this.onLoad(lesson);
      this.close();
    });
    this.root.querySelector('[data-lesson-run]').addEventListener('click', () => {
      this.onRun(lesson);
      this.close();
    });
  }
}
