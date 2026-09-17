import Graph from '@plugola/graph'
import { Plugin } from './Plugin.js'

export default class DependencyGraph<T extends Plugin> extends Graph<
  T,
  'dependency' | 'depender' | 'optionalDependency' | 'optionalDepender'
> {
  addDependency(source: T, dependency: T) {
    this.addEdge('dependency', source, dependency)
    this.addEdge('depender', dependency, source)
  }

  addOptionalDependency(source: T, dependency: T) {
    this.addEdge('optionalDependency', source, dependency)
    this.addEdge('optionalDepender', dependency, source)
  }

  dependencies(node: T) {
    return this.bfs(node, 'dependency', false)
  }

  dependers(node: T) {
    return this.bfs(node, 'depender', false)
  }

  optionalDependencies(node: T) {
    return this.bfs(node, 'optionalDependency', false)
  }

  optionalDependers(node: T) {
    return this.bfs(node, 'optionalDepender', false)
  }
}
