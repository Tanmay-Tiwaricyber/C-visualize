/**
 * Example program library.
 *
 * Every entry is a complete, compilable C program. `algorithm` marks programs
 * that the Arrays & pointers panel can animate from the trace (the array
 * variable to watch is named in `watch`).
 */

const ex = (id, title, category, description, code, extra = {}) => ({
  id,
  title,
  category,
  description,
  code: code.replace(/^\n/, '').replace(/\s+$/, '\n'),
  ...extra,
});

export const DEFAULT_PROGRAM = `#include <stdio.h>

/* C Visualizer: press Run, then step through the trace. */
int main(void) {
    int marks[5] = {72, 85, 91, 64, 78};
    int total = 0;
    int i;

    for (i = 0; i < 5; i++) {
        total = total + marks[i];
    }

    double average = total / 5.0;
    printf("Total   : %d\\n", total);
    printf("Average : %.1f\\n", average);

    return 0;
}
`;

export const EXAMPLES = [
  // ---------------------------------------------------------------- Basics
  ex(
    'hello-world',
    'Hello, World',
    'Basics',
    'The smallest complete C program: one function, one output statement.',
    `
#include <stdio.h>

int main(void) {
    printf("Hello, World!\\n");
    printf("This is C Visualizer.\\n");
    return 0;
}
`,
  ),
  ex(
    'add-two',
    'Addition of two numbers',
    'Basics',
    'Declare two integers, add them, and observe each variable appear in the inspector.',
    `
#include <stdio.h>

int main(void) {
    int a = 12;
    int b = 30;
    int sum = a + b;

    printf("%d + %d = %d\\n", a, b, sum);
    return 0;
}
`,
  ),
  ex(
    'arithmetic',
    'Arithmetic operations',
    'Basics',
    'Integer division truncates; floating point division does not. Watch the types.',
    `
#include <stdio.h>

int main(void) {
    int a = 7;
    int b = 2;

    int sum = a + b;
    int difference = a - b;
    int product = a * b;
    int quotient = a / b;          /* integer division */
    int remainder = a % b;
    double exact = (double)a / b;  /* type conversion */

    printf("%d + %d = %d\\n", a, b, sum);
    printf("%d - %d = %d\\n", a, b, difference);
    printf("%d * %d = %d\\n", a, b, product);
    printf("%d / %d = %d (remainder %d)\\n", a, b, quotient, remainder);
    printf("Exact division = %.2f\\n", exact);
    return 0;
}
`,
  ),
  ex(
    'even-odd',
    'Even or odd',
    'Basics',
    'A single if/else decision. The flowchart shows which branch is taken.',
    `
#include <stdio.h>

int main(void) {
    int number = 17;

    if (number % 2 == 0) {
        printf("%d is even\\n", number);
    } else {
        printf("%d is odd\\n", number);
    }

    return 0;
}
`,
  ),
  ex(
    'largest-three',
    'Largest of three numbers',
    'Basics',
    'Nested conditions: the flowchart reveals exactly which comparison decided the answer.',
    `
#include <stdio.h>

int main(void) {
    int a = 42;
    int b = 91;
    int c = 67;
    int largest;

    if (a >= b && a >= c) {
        largest = a;
    } else if (b >= a && b >= c) {
        largest = b;
    } else {
        largest = c;
    }

    printf("Largest = %d\\n", largest);
    return 0;
}
`,
  ),
  ex(
    'calculator',
    'Simple calculator (stdin)',
    'Basics',
    'Reads an operator and two numbers from standard input. Put values in the Input tab first.',
    `
#include <stdio.h>

int main(void) {
    char op;
    double a, b;

    printf("Enter expression (e.g. + 12 4): ");
    if (scanf(" %c %lf %lf", &op, &a, &b) != 3) {
        printf("Input error\\n");
        return 1;
    }

    switch (op) {
        case '+': printf("%.2f\\n", a + b); break;
        case '-': printf("%.2f\\n", a - b); break;
        case '*': printf("%.2f\\n", a * b); break;
        case '/':
            if (b == 0) {
                printf("Division by zero\\n");
            } else {
                printf("%.2f\\n", a / b);
            }
            break;
        default: printf("Unknown operator\\n");
    }

    return 0;
}
`,
    { stdin: '+ 12 4\n' },
  ),
  ex(
    'swap-two',
    'Swap two numbers',
    'Basics',
    'The classic temporary variable swap. Watch both values change at once.',
    `
#include <stdio.h>

int main(void) {
    int a = 5;
    int b = 9;
    int temp;

    printf("Before: a = %d, b = %d\\n", a, b);

    temp = a;
    a = b;
    b = temp;

    printf("After : a = %d, b = %d\\n", a, b);
    return 0;
}
`,
  ),

  // ------------------------------------------------------------ Control flow
  ex(
    'sum-1-to-n',
    'Sum from 1 to N',
    'Loops',
    'A counted loop that accumulates a running total. Watch total grow every iteration.',
    `
#include <stdio.h>

int main(void) {
    int n = 10;
    int total = 0;
    int i;

    for (i = 1; i <= n; i++) {
        total += i;
    }

    printf("Sum of 1..%d = %d\\n", n, total);
    return 0;
}
`,
  ),
  ex(
    'multiplication-table',
    'Multiplication table',
    'Loops',
    'A nested loop prints a table. The inner loop completes before the outer one advances.',
    `
#include <stdio.h>

int main(void) {
    int n = 5;
    int i, j;

    for (i = 1; i <= n; i++) {
        for (j = 1; j <= n; j++) {
            printf("%4d", i * j);
        }
        printf("\\n");
    }

    return 0;
}
`,
  ),
  ex(
    'factorial-loop',
    'Factorial using a loop',
    'Loops',
    'Iterative factorial: result is multiplied by each counter value in turn.',
    `
#include <stdio.h>

int main(void) {
    int n = 6;
    long result = 1;
    int i;

    for (i = 2; i <= n; i++) {
        result = result * i;
    }

    printf("%d! = %ld\\n", n, result);
    return 0;
}
`,
  ),
  ex(
    'fibonacci-series',
    'Fibonacci series',
    'Loops',
    'Each term is the sum of the previous two, held in three variables.',
    `
#include <stdio.h>

int main(void) {
    int count = 10;
    int first = 0;
    int second = 1;
    int next;
    int i;

    printf("%d %d ", first, second);
    for (i = 3; i <= count; i++) {
        next = first + second;
        printf("%d ", next);
        first = second;
        second = next;
    }
    printf("\\n");
    return 0;
}
`,
  ),
  ex(
    'prime-check',
    'Prime number check',
    'Loops',
    'A loop with break: the first divisor found proves the number is not prime.',
    `
#include <stdio.h>

int main(void) {
    int n = 97;
    int is_prime = 1;
    int i;

    if (n < 2) {
        is_prime = 0;
    }

    for (i = 2; i * i <= n; i++) {
        if (n % i == 0) {
            is_prime = 0;
            break;
        }
    }

    if (is_prime) {
        printf("%d is prime\\n", n);
    } else {
        printf("%d is not prime\\n", n);
    }

    return 0;
}
`,
  ),
  ex(
    'nested-loops',
    'Nested loops with continue',
    'Loops',
    'continue skips the rest of the body but not the increment step.',
    `
#include <stdio.h>

int main(void) {
    int i, j;

    for (i = 1; i <= 4; i++) {
        for (j = 1; j <= 5; j++) {
            if (j == 3) {
                continue;
            }
            printf("(%d,%d) ", i, j);
        }
        printf("\\n");
    }

    return 0;
}
`,
  ),

  // -------------------------------------------------------------- Patterns
  ex(
    'star-triangle',
    'Right-angled star triangle',
    'Patterns',
    'Row i prints i stars. The nested loop bounds depend on the outer counter.',
    `
#include <stdio.h>

int main(void) {
    int rows = 5;
    int i, j;

    for (i = 1; i <= rows; i++) {
        for (j = 1; j <= i; j++) {
            printf("* ");
        }
        printf("\\n");
    }

    return 0;
}
`,
  ),
  ex(
    'inverted-triangle',
    'Inverted star triangle',
    'Patterns',
    'The star count decreases as the row number increases.',
    `
#include <stdio.h>

int main(void) {
    int rows = 5;
    int i, j;

    for (i = rows; i >= 1; i--) {
        for (j = 1; j <= i; j++) {
            printf("* ");
        }
        printf("\\n");
    }

    return 0;
}
`,
  ),
  ex(
    'pyramid',
    'Star pyramid',
    'Patterns',
    'Two inner loops: one prints spaces, the other prints stars.',
    `
#include <stdio.h>

int main(void) {
    int rows = 5;
    int i, j;

    for (i = 1; i <= rows; i++) {
        for (j = 1; j <= rows - i; j++) {
            printf(" ");
        }
        for (j = 1; j <= 2 * i - 1; j++) {
            printf("*");
        }
        printf("\\n");
    }

    return 0;
}
`,
  ),
  ex(
    'floyds-triangle',
    'Floyd triangle',
    'Patterns',
    'A single counter keeps increasing across rows.',
    `
#include <stdio.h>

int main(void) {
    int rows = 5;
    int value = 1;
    int i, j;

    for (i = 1; i <= rows; i++) {
        for (j = 1; j <= i; j++) {
            printf("%d ", value);
            value++;
        }
        printf("\\n");
    }

    return 0;
}
`,
  ),
  ex(
    'number-triangle',
    'Number triangle',
    'Patterns',
    'The character printed depends on the inner counter.',
    `
#include <stdio.h>

int main(void) {
    int rows = 5;
    int i, j;

    for (i = 1; i <= rows; i++) {
        for (j = 1; j <= i; j++) {
            printf("%d ", j);
        }
        printf("\\n");
    }

    return 0;
}
`,
  ),
  ex(
    'alphabet-pattern',
    'Alphabet pattern',
    'Patterns',
    'Characters are integers in C: ch++ moves to the next letter.',
    `
#include <stdio.h>

int main(void) {
    int rows = 5;
    int i, j;
    char ch = 'A';

    for (i = 1; i <= rows; i++) {
        for (j = 1; j <= i; j++) {
            printf("%c ", ch);
            ch++;
        }
        printf("\\n");
    }

    return 0;
}
`,
  ),

  // ------------------------------------------------------ Functions/recursion
  ex(
    'function-no-params',
    'Function without parameters',
    'Functions',
    'main calls a helper. The call stack panel shows the two frames.',
    `
#include <stdio.h>

void print_banner(void) {
    printf("=================\\n");
    printf(" C Visualizer\\n");
    printf("=================\\n");
}

int main(void) {
    print_banner();
    printf("Program finished.\\n");
    return 0;
}
`,
  ),
  ex(
    'function-params',
    'Function with parameters',
    'Functions',
    'Arguments are copied into the parameters of the new frame.',
    `
#include <stdio.h>

int add(int left, int right) {
    int result = left + right;
    return result;
}

int main(void) {
    int x = 15;
    int y = 27;
    int total = add(x, y);

    printf("%d + %d = %d\\n", x, y, total);
    return 0;
}
`,
  ),
  ex(
    'call-by-value',
    'Call by value',
    'Functions',
    'The function changes its own copy; the caller variable is untouched.',
    `
#include <stdio.h>

void try_to_change(int value) {
    value = value + 100;
    printf("Inside function: value = %d\\n", value);
}

int main(void) {
    int original = 5;

    try_to_change(original);
    printf("Inside main    : original = %d\\n", original);
    return 0;
}
`,
  ),
  ex(
    'recursive-factorial',
    'Recursive factorial',
    'Functions & recursion',
    'Each call pushes a new frame. Watch the frames unwind as values are returned.',
    `
#include <stdio.h>

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
  ),
  ex(
    'recursive-fibonacci',
    'Recursive Fibonacci',
    'Functions & recursion',
    'A recursion tree: the call stack grows and shrinks through many frames.',
    `
#include <stdio.h>

int fib(int n) {
    if (n <= 1) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}

int main(void) {
    int n = 6;
    int result = fib(n);

    printf("fib(%d) = %d\\n", n, result);
    return 0;
}
`,
  ),
  ex(
    'recursive-sum',
    'Recursive sum 1..N',
    'Functions & recursion',
    'The base case n == 0 stops the recursion; the additions happen on the way back.',
    `
#include <stdio.h>

int sum_to(int n) {
    if (n == 0) {
        return 0;
    }
    return n + sum_to(n - 1);
}

int main(void) {
    int n = 5;
    int total = sum_to(n);

    printf("sum(1..%d) = %d\\n", n, total);
    return 0;
}
`,
  ),
  ex(
    'recursive-array',
    'Recursive array traversal',
    'Functions & recursion',
    'The array is passed as a pointer; index grows until it reaches the length.',
    `
#include <stdio.h>

int array_sum(const int values[], int index, int length) {
    if (index == length) {
        return 0;
    }
    return values[index] + array_sum(values, index + 1, length);
}

int main(void) {
    int values[6] = {4, 8, 15, 16, 23, 42};
    int total = array_sum(values, 0, 6);

    printf("Sum = %d\\n", total);
    return 0;
}
`,
  ),

  // ---------------------------------------------------------------- Arrays
  ex(
    'array-traverse',
    'Array traversal',
    'Arrays',
    'Contiguous elements are shown in the Arrays panel as the loop walks them.',
    `
#include <stdio.h>

int main(void) {
    int values[6] = {10, 20, 30, 40, 50, 60};
    int i;

    for (i = 0; i < 6; i++) {
        printf("values[%d] = %d\\n", i, values[i]);
    }

    return 0;
}
`,
    { algorithm: true, watch: 'values' },
  ),
  ex(
    'array-min-max',
    'Minimum and maximum',
    'Arrays',
    'Two accumulators are updated inside one traversal.',
    `
#include <stdio.h>

int main(void) {
    int values[8] = {23, 5, 87, 12, 64, 3, 99, 41};
    int n = 8;
    int minimum = values[0];
    int maximum = values[0];
    int i;

    for (i = 1; i < n; i++) {
        if (values[i] < minimum) {
            minimum = values[i];
        }
        if (values[i] > maximum) {
            maximum = values[i];
        }
    }

    printf("Minimum = %d\\n", minimum);
    printf("Maximum = %d\\n", maximum);
    return 0;
}
`,
    { algorithm: true, watch: 'values' },
  ),
  ex(
    'reverse-array',
    'Reverse an array',
    'Arrays',
    'Two indices move towards each other, swapping elements as they meet.',
    `
#include <stdio.h>

int main(void) {
    int values[7] = {1, 2, 3, 4, 5, 6, 7};
    int n = 7;
    int start = 0;
    int end = n - 1;
    int temp;

    while (start < end) {
        temp = values[start];
        values[start] = values[end];
        values[end] = temp;
        start++;
        end--;
    }

    for (start = 0; start < n; start++) {
        printf("%d ", values[start]);
    }
    printf("\\n");
    return 0;
}
`,
    { algorithm: true, watch: 'values' },
  ),
  ex(
    'linear-search',
    'Linear search',
    'Algorithms',
    'Every element is compared in order until the key is found.',
    `
#include <stdio.h>

int main(void) {
    int values[8] = {14, 22, 9, 31, 47, 5, 68, 26};
    int n = 8;
    int key = 47;
    int found = -1;
    int i;

    for (i = 0; i < n; i++) {
        if (values[i] == key) {
            found = i;
            break;
        }
    }

    if (found >= 0) {
        printf("%d found at index %d\\n", key, found);
    } else {
        printf("%d not found\\n", key);
    }

    return 0;
}
`,
    { algorithm: true, watch: 'values' },
  ),
  ex(
    'binary-search',
    'Binary search',
    'Algorithms',
    'low, high and mid move until the key is found in a sorted array.',
    `
#include <stdio.h>

int main(void) {
    int values[9] = {4, 9, 15, 22, 31, 44, 58, 63, 90};
    int n = 9;
    int key = 44;
    int low = 0;
    int high = n - 1;
    int mid = 0;
    int found = -1;

    while (low <= high) {
        mid = (low + high) / 2;
        if (values[mid] == key) {
            found = mid;
            break;
        }
        if (values[mid] < key) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (found >= 0) {
        printf("%d found at index %d\\n", key, found);
    } else {
        printf("%d not found\\n", key);
    }

    return 0;
}
`,
    { algorithm: true, watch: 'values' },
  ),
  ex(
    'bubble-sort',
    'Bubble sort',
    'Algorithms',
    'Adjacent comparisons and swaps. Watch the largest values bubble to the right.',
    `
#include <stdio.h>

int main(void) {
    int values[8] = {42, 17, 93, 8, 56, 31, 74, 25};
    int n = 8;
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
    { algorithm: true, watch: 'values' },
  ),
  ex(
    'selection-sort',
    'Selection sort',
    'Algorithms',
    'Find the smallest remaining element and swap it into place.',
    `
#include <stdio.h>

int main(void) {
    int values[7] = {29, 10, 14, 37, 13, 5, 22};
    int n = 7;
    int i, j, minimum, temp;

    for (i = 0; i < n - 1; i++) {
        minimum = i;
        for (j = i + 1; j < n; j++) {
            if (values[j] < values[minimum]) {
                minimum = j;
            }
        }
        if (minimum != i) {
            temp = values[i];
            values[i] = values[minimum];
            values[minimum] = temp;
        }
    }

    for (i = 0; i < n; i++) {
        printf("%d ", values[i]);
    }
    printf("\\n");
    return 0;
}
`,
    { algorithm: true, watch: 'values' },
  ),
  ex(
    'insertion-sort',
    'Insertion sort',
    'Algorithms',
    'Each new element is inserted into the already sorted prefix.',
    `
#include <stdio.h>

int main(void) {
    int values[7] = {12, 5, 19, 3, 27, 8, 14};
    int n = 7;
    int i, j, key;

    for (i = 1; i < n; i++) {
        key = values[i];
        j = i - 1;
        while (j >= 0 && values[j] > key) {
            values[j + 1] = values[j];
            j = j - 1;
        }
        values[j + 1] = key;
    }

    for (i = 0; i < n; i++) {
        printf("%d ", values[i]);
    }
    printf("\\n");
    return 0;
}
`,
    { algorithm: true, watch: 'values' },
  ),

  // -------------------------------------------------------------- Pointers
  ex(
    'pointer-basics',
    'Pointer basics',
    'Pointers',
    'A pointer stores an address. The Memory panel draws the reference.',
    `
#include <stdio.h>

int main(void) {
    int value = 42;
    int *pointer = &value;

    printf("value      = %d\\n", value);
    printf("&value     = %p\\n", (void *)&value);
    printf("pointer    = %p\\n", (void *)pointer);
    printf("*pointer   = %d\\n", *pointer);

    *pointer = 99;
    printf("value now  = %d\\n", value);
    return 0;
}
`,
  ),
  ex(
    'pointer-arithmetic',
    'Pointer arithmetic',
    'Pointers',
    'pointer + 1 advances by sizeof(int) bytes, not one byte.',
    `
#include <stdio.h>

int main(void) {
    int values[5] = {10, 20, 30, 40, 50};
    int *cursor = values;
    int i;

    for (i = 0; i < 5; i++) {
        printf("address %p holds %d\\n", (void *)(cursor + i), *(cursor + i));
    }

    printf("cursor[2] = %d\\n", cursor[2]);
    return 0;
}
`,
  ),
  ex(
    'pointer-swap',
    'Swap through pointers',
    'Pointers',
    'The function modifies the caller variables through addresses.',
    `
#include <stdio.h>

void swap(int *first, int *second) {
    int temp = *first;
    *first = *second;
    *second = temp;
}

int main(void) {
    int a = 11;
    int b = 77;

    printf("Before: a = %d, b = %d\\n", a, b);
    swap(&a, &b);
    printf("After : a = %d, b = %d\\n", a, b);
    return 0;
}
`,
  ),

  // --------------------------------------------------------------- Strings
  ex(
    'string-length',
    'String length manually',
    'Strings',
    'A C string is a char array terminated by a NUL byte. The loop counts characters until it finds it.',
    `
#include <stdio.h>

int main(void) {
    char text[] = "visualizer";
    int length = 0;

    while (text[length] != '\\0') {
        length++;
    }

    printf("\\"%s\\" has %d characters\\n", text, length);
    return 0;
}
`,
  ),
  ex(
    'string-reverse',
    'Reverse a string',
    'Strings',
    'Characters are swapped from both ends of the array.',
    `
#include <stdio.h>

int main(void) {
    char text[] = "trace";
    int length = 0;
    int start, end;
    char temp;

    while (text[length] != '\\0') {
        length++;
    }

    start = 0;
    end = length - 1;
    while (start < end) {
        temp = text[start];
        text[start] = text[end];
        text[end] = temp;
        start++;
        end--;
    }

    printf("Reversed: %s\\n", text);
    return 0;
}
`,
  ),
  ex(
    'palindrome',
    'Palindrome check',
    'Strings',
    'Two pointers walk towards the middle comparing characters.',
    `
#include <stdio.h>

int main(void) {
    char text[] = "madam";
    int length = 0;
    int start, end;
    int is_palindrome = 1;

    while (text[length] != '\\0') {
        length++;
    }

    start = 0;
    end = length - 1;
    while (start < end) {
        if (text[start] != text[end]) {
            is_palindrome = 0;
            break;
        }
        start++;
        end--;
    }

    if (is_palindrome) {
        printf("\\"%s\\" is a palindrome\\n", text);
    } else {
        printf("\\"%s\\" is not a palindrome\\n", text);
    }

    return 0;
}
`,
  ),

  // ------------------------------------------------------------ Structures
  ex(
    'struct-basics',
    'Structure basics',
    'Structures',
    'A struct groups fields; the inspector expands it into its members.',
    `
#include <stdio.h>

struct Student {
    char name[12];
    int roll;
    float marks;
};

int main(void) {
    struct Student s1 = {"Aarav", 21, 87.5};
    struct Student s2;

    s2 = s1;
    s2.roll = 22;
    s2.marks = 91.0;

    printf("%s (roll %d) scored %.1f\\n", s1.name, s1.roll, s1.marks);
    printf("%s (roll %d) scored %.1f\\n", s2.name, s2.roll, s2.marks);
    return 0;
}
`,
  ),
  ex(
    'struct-array',
    'Array of structures',
    'Structures',
    'An array of structs is contiguous memory; each element has its own fields.',
    `
#include <stdio.h>

struct Point {
    int x;
    int y;
};

int main(void) {
    struct Point path[4] = {{0, 0}, {3, 4}, {6, 8}, {9, 12}};
    int i;
    int total = 0;

    for (i = 0; i < 4; i++) {
        total += path[i].x + path[i].y;
    }

    printf("Sum of coordinates = %d\\n", total);
    return 0;
}
`,
  ),

  // --------------------------------------------------------------- Memory
  ex(
    'malloc-basics',
    'Dynamic memory (malloc/free)',
    'Memory',
    'malloc returns a pointer into the heap. Use the Sanitizers switch to detect leaks and overflows.',
    `
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int n = 5;
    int *values = (int *)malloc(n * sizeof(int));
    int i;
    int total = 0;

    if (values == NULL) {
        printf("Allocation failed\\n");
        return 1;
    }

    for (i = 0; i < n; i++) {
        values[i] = (i + 1) * 10;
        total += values[i];
    }

    printf("Total = %d\\n", total);
    free(values);
    values = NULL;
    return 0;
}
`,
  ),
  ex(
    'heap-overflow',
    'Heap overflow (sanitizer demo)',
    'Memory',
    'Deliberately unsafe: writes past the end of a heap block. Turn Sanitizers on to catch it.',
    `
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int *values = (int *)malloc(4 * sizeof(int));
    int i;

    for (i = 0; i <= 4; i++) {   /* i == 4 is out of bounds */
        values[i] = i * 10;
    }

    printf("Wrote past the end: %d\\n", values[3]);
    free(values);
    return 0;
}
`,
    { unsafe: true },
  ),
  ex(
    'dangling-pointer',
    'Dangling pointer',
    'Memory',
    'Deliberately unsafe: returns the address of a local variable. The debugger shows the bogus value.',
    `
#include <stdio.h>

int *make_value(void) {
    int local = 42;
    return &local;   /* local dies when the function returns */
}

int main(void) {
    int *dangling = make_value();
    printf("Value through dangling pointer: %d\\n", *dangling);
    return 0;
}
`,
    { unsafe: true },
  ),
  ex(
    'linked-list',
    'Linked list',
    'Memory',
    'Nodes are allocated on the heap and linked through pointers.',
    `
#include <stdio.h>
#include <stdlib.h>

struct Node {
    int data;
    struct Node *next;
};

int main(void) {
    struct Node *head = NULL;
    struct Node *tail = NULL;
    struct Node *node;
    int i;

    for (i = 1; i <= 4; i++) {
        node = (struct Node *)malloc(sizeof(struct Node));
        if (node == NULL) {
            return 1;
        }
        node->data = i * 11;
        node->next = NULL;
        if (head == NULL) {
            head = node;
            tail = node;
        } else {
            tail->next = node;
            tail = node;
        }
    }

    node = head;
    while (node != NULL) {
        printf("%d -> ", node->data);
        node = node->next;
    }
    printf("NULL\\n");

    while (head != NULL) {
        node = head;
        head = head->next;
        free(node);
    }

    return 0;
}
`,
  ),
];

export const EXAMPLE_CATEGORIES = [...new Set(EXAMPLES.map((item) => item.category))];

export function findExample(id) {
  return EXAMPLES.find((item) => item.id === id) || null;
}
