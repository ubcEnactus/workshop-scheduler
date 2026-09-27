export type FlowEdgeInput = { from: string; to: string; capacity: number; cost?: number }
export type FlowDiagnostics = { nodes: number; edges: number; augmentations: number }
export type FlowResult = {
  flow: number
  cost: number
  edgeFlows: number[]
  reachable: Set<string>
  diagnostics: FlowDiagnostics
}
type Edge = { to: number; reverse: number; capacity: number; cost: number; input: number | null }

/** Deterministic successive-shortest-path min-cost maximum flow. */
export function minCostMaximumFlow(
  sourceName: string,
  sinkName: string,
  inputs: readonly FlowEdgeInput[]
): FlowResult {
  const names = [
    ...new Set([sourceName, sinkName, ...inputs.flatMap((edge) => [edge.from, edge.to])]),
  ].sort()
  const index = new Map(names.map((name, position) => [name, position]))
  const graph: Edge[][] = names.map(() => [])
  const edgeFlows = inputs.map(() => 0)
  const add = (from: number, to: number, capacity: number, cost: number, input: number | null) => {
    graph[from].push({ to, reverse: graph[to].length, capacity, cost, input })
    graph[to].push({
      to: from,
      reverse: graph[from].length - 1,
      capacity: 0,
      cost: -cost,
      input: null,
    })
  }
  inputs.forEach((edge, input) =>
    add(index.get(edge.from)!, index.get(edge.to)!, edge.capacity, edge.cost ?? 0, input)
  )
  const source = index.get(sourceName)!
  const sink = index.get(sinkName)!
  let flow = 0
  let cost = 0
  let augmentations = 0
  const potential = names.map(() => 0)
  while (true) {
    const distance = names.map(() => Number.POSITIVE_INFINITY)
    const previousNode = names.map(() => -1)
    const previousEdge = names.map(() => -1)
    distance[source] = 0
    const heap: { distance: number; node: number }[] = [{ distance: 0, node: source }]
    const push = (item: { distance: number; node: number }) => {
      heap.push(item)
      for (let child = heap.length - 1; child > 0; ) {
        const parent = Math.floor((child - 1) / 2)
        if (heap[parent].distance <= heap[child].distance) break
        ;[heap[parent], heap[child]] = [heap[child], heap[parent]]
        child = parent
      }
    }
    while (heap.length) {
      const current = heap[0]
      const tail = heap.pop()!
      if (heap.length) {
        heap[0] = tail
        for (let parent = 0; ; ) {
          const left = parent * 2 + 1
          const right = left + 1
          let child = left
          if (right < heap.length && heap[right].distance < heap[left].distance) child = right
          if (left >= heap.length || heap[parent].distance <= heap[child].distance) break
          ;[heap[parent], heap[child]] = [heap[child], heap[parent]]
          parent = child
        }
      }
      if (current.distance !== distance[current.node]) continue
      for (let edgeIndex = 0; edgeIndex < graph[current.node].length; edgeIndex += 1) {
        const edge = graph[current.node][edgeIndex]
        const next = current.distance + edge.cost + potential[current.node] - potential[edge.to]
        if (edge.capacity > 0 && next < distance[edge.to]) {
          distance[edge.to] = next
          previousNode[edge.to] = current.node
          previousEdge[edge.to] = edgeIndex
          push({ distance: next, node: edge.to })
        }
      }
    }
    if (!Number.isFinite(distance[sink])) break
    for (let node = 0; node < names.length; node += 1)
      if (Number.isFinite(distance[node])) potential[node] += distance[node]
    let amount = Number.POSITIVE_INFINITY
    for (let node = sink; node !== source; node = previousNode[node])
      amount = Math.min(amount, graph[previousNode[node]][previousEdge[node]].capacity)
    for (let node = sink; node !== source; node = previousNode[node]) {
      const edge = graph[previousNode[node]][previousEdge[node]]
      edge.capacity -= amount
      graph[node][edge.reverse].capacity += amount
      if (edge.input !== null) edgeFlows[edge.input] += amount
      else {
        const reverse = graph[node][edge.reverse]
        if (reverse.input !== null) edgeFlows[reverse.input] -= amount
      }
    }
    flow += amount
    cost += amount * potential[sink]
    augmentations += 1
  }
  const reachableIndexes = new Set<number>([source])
  const queue = [source]
  while (queue.length) {
    const from = queue.shift()!
    for (const edge of graph[from])
      if (edge.capacity > 0 && !reachableIndexes.has(edge.to)) {
        reachableIndexes.add(edge.to)
        queue.push(edge.to)
      }
  }
  return {
    flow,
    cost,
    edgeFlows,
    reachable: new Set([...reachableIndexes].map((position) => names[position])),
    diagnostics: { nodes: names.length, edges: inputs.length, augmentations },
  }
}
