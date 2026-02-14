/** Task DAG utilities -- topological sort via Kahn's algorithm. */

export class TaskDAG {
  private graph: Map<string, Set<string>> = new Map();

  addTask(taskId: string, dependencies: string[] = []): void {
    this.graph.set(taskId, new Set(dependencies));
  }

  /** Return tasks in topological order. Throws on cycles. */
  getOrder(): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const [node, deps] of this.graph) {
      if (!inDegree.has(node)) inDegree.set(node, 0);
      if (!adjacency.has(node)) adjacency.set(node, []);
      for (const dep of deps) {
        if (!inDegree.has(dep)) inDegree.set(dep, 0);
        if (!adjacency.has(dep)) adjacency.set(dep, []);
        adjacency.get(dep)!.push(node);
        inDegree.set(node, (inDegree.get(node) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [node, deg] of inDegree) {
      if (deg === 0) queue.push(node);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      for (const neighbor of adjacency.get(node) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    if (result.length !== inDegree.size) {
      throw new Error('Circular dependencies in task DAG');
    }

    return result;
  }

  /** Return tasks ready to execute given the completed set. */
  getReady(completed: Set<string>): string[] {
    const ready: string[] = [];
    for (const [taskId, deps] of this.graph) {
      if (!completed.has(taskId) && isSubset(deps, completed)) {
        ready.push(taskId);
      }
    }
    return ready;
  }

  /** Return the direct dependencies of a task. */
  getDeps(taskId: string): Set<string> {
    return this.graph.get(taskId) ?? new Set();
  }
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
