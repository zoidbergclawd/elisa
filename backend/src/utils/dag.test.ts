import { describe, it, expect } from 'vitest';
import { TaskDAG } from './dag.js';

describe('TaskDAG', () => {
  describe('addTask', () => {
    it('should add a task with no dependencies', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      expect(dag.getOrder()).toEqual(['a']);
    });

    it('should add a task with dependencies', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b', ['a']);
      const order = dag.getOrder();
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    });

    it('should overwrite dependencies when adding the same task id again', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b', ['a']);
      // Re-add 'b' with no dependencies
      dag.addTask('b');
      // 'b' no longer depends on 'a', so both are roots
      const order = dag.getOrder();
      expect(order).toHaveLength(2);
      expect(order).toContain('a');
      expect(order).toContain('b');
    });
  });

  describe('getOrder (topological sort)', () => {
    it('should return empty array for empty DAG', () => {
      const dag = new TaskDAG();
      expect(dag.getOrder()).toEqual([]);
    });

    it('should return single node', () => {
      const dag = new TaskDAG();
      dag.addTask('only');
      expect(dag.getOrder()).toEqual(['only']);
    });

    it('should handle linear chain A -> B -> C', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b', ['a']);
      dag.addTask('c', ['b']);
      expect(dag.getOrder()).toEqual(['a', 'b', 'c']);
    });

    it('should handle diamond dependency: A -> B, A -> C, B+C -> D', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b', ['a']);
      dag.addTask('c', ['a']);
      dag.addTask('d', ['b', 'c']);
      const order = dag.getOrder();
      expect(order).toHaveLength(4);
      expect(order.indexOf('a')).toBe(0);
      expect(order.indexOf('d')).toBe(3);
      // b and c must come after a and before d
      expect(order.indexOf('b')).toBeGreaterThan(order.indexOf('a'));
      expect(order.indexOf('c')).toBeGreaterThan(order.indexOf('a'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
    });

    it('should handle multiple independent roots', () => {
      const dag = new TaskDAG();
      dag.addTask('x');
      dag.addTask('y');
      dag.addTask('z');
      const order = dag.getOrder();
      expect(order).toHaveLength(3);
      expect(new Set(order)).toEqual(new Set(['x', 'y', 'z']));
    });

    it('should handle complex multi-level DAG', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b');
      dag.addTask('c', ['a']);
      dag.addTask('d', ['a', 'b']);
      dag.addTask('e', ['c', 'd']);
      const order = dag.getOrder();
      expect(order).toHaveLength(5);
      // a before c, d; b before d; c,d before e
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('d'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('e'));
      expect(order.indexOf('d')).toBeLessThan(order.indexOf('e'));
    });

    it('should include dependency nodes not explicitly added as tasks', () => {
      const dag = new TaskDAG();
      // 'a' is only referenced as a dependency, never explicitly added
      dag.addTask('b', ['a']);
      const order = dag.getOrder();
      expect(order).toHaveLength(2);
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    });
  });

  describe('cycle detection', () => {
    it('should throw on direct self-cycle', () => {
      const dag = new TaskDAG();
      dag.addTask('a', ['a']);
      expect(() => dag.getOrder()).toThrow('Circular dependencies in task DAG');
    });

    it('should throw on two-node cycle: A -> B -> A', () => {
      const dag = new TaskDAG();
      dag.addTask('a', ['b']);
      dag.addTask('b', ['a']);
      expect(() => dag.getOrder()).toThrow('Circular dependencies in task DAG');
    });

    it('should throw on three-node cycle: A -> B -> C -> A', () => {
      const dag = new TaskDAG();
      dag.addTask('a', ['c']);
      dag.addTask('b', ['a']);
      dag.addTask('c', ['b']);
      expect(() => dag.getOrder()).toThrow('Circular dependencies in task DAG');
    });

    it('should throw when cycle is embedded in a larger DAG', () => {
      const dag = new TaskDAG();
      dag.addTask('root');
      dag.addTask('a', ['root']);
      dag.addTask('b', ['a']);
      dag.addTask('c', ['b']);
      dag.addTask('a', ['c']); // overwrites 'a' to create cycle b -> c -> a -> b... wait
      // Actually after overwrite, a depends on c, b depends on a, c depends on b => cycle
      dag.addTask('b', ['a']);
      dag.addTask('c', ['b']);
      expect(() => dag.getOrder()).toThrow('Circular dependencies in task DAG');
    });
  });

  describe('getReady', () => {
    it('should return all tasks when none have dependencies and none completed', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b');
      dag.addTask('c');
      const ready = dag.getReady(new Set());
      expect(new Set(ready)).toEqual(new Set(['a', 'b', 'c']));
    });

    it('should return empty when all tasks are completed', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b');
      const ready = dag.getReady(new Set(['a', 'b']));
      expect(ready).toEqual([]);
    });

    it('should not return tasks whose dependencies are not yet completed', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b', ['a']);
      const ready = dag.getReady(new Set());
      expect(ready).toEqual(['a']);
    });

    it('should return tasks once their dependencies are completed', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b', ['a']);
      dag.addTask('c', ['a']);
      const ready = dag.getReady(new Set(['a']));
      expect(new Set(ready)).toEqual(new Set(['b', 'c']));
    });

    it('should handle diamond: only return D when both B and C are completed', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b', ['a']);
      dag.addTask('c', ['a']);
      dag.addTask('d', ['b', 'c']);

      // Only a completed
      expect(new Set(dag.getReady(new Set(['a'])))).toEqual(new Set(['b', 'c']));

      // a and b completed - c is ready, d still blocked by c
      const readyAfterB = dag.getReady(new Set(['a', 'b']));
      expect(readyAfterB).toEqual(['c']);

      // a, b, c completed - d is now ready
      const readyAfterBC = dag.getReady(new Set(['a', 'b', 'c']));
      expect(readyAfterBC).toEqual(['d']);
    });

    it('should return empty array for empty DAG', () => {
      const dag = new TaskDAG();
      expect(dag.getReady(new Set())).toEqual([]);
    });

    it('should handle partial completion in a chain', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b', ['a']);
      dag.addTask('c', ['b']);
      dag.addTask('d', ['c']);

      expect(dag.getReady(new Set())).toEqual(['a']);
      expect(dag.getReady(new Set(['a']))).toEqual(['b']);
      expect(dag.getReady(new Set(['a', 'b']))).toEqual(['c']);
      expect(dag.getReady(new Set(['a', 'b', 'c']))).toEqual(['d']);
      expect(dag.getReady(new Set(['a', 'b', 'c', 'd']))).toEqual([]);
    });

    it('should exclude completed tasks from ready list even if dependencies met', () => {
      const dag = new TaskDAG();
      dag.addTask('a');
      dag.addTask('b', ['a']);
      // a is completed, b depends on a and is also completed
      const ready = dag.getReady(new Set(['a', 'b']));
      expect(ready).toEqual([]);
    });
  });
});
