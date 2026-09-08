import {
  assemblyGroupPathsOf,
  TecDocAssemblyGroupFacetCount,
} from './assembly-group-facet';

function node(
  assemblyGroupNodeId: number,
  assemblyGroupName: string,
  parentNodeId?: number,
): TecDocAssemblyGroupFacetCount {
  return { assemblyGroupNodeId, assemblyGroupName, parentNodeId };
}

/** The trails as labels, which is all a breadcrumb renders. */
const trails = (paths: Array<Array<{ label: string }>>) =>
  paths.map((path) => path.map((step) => step.label));

describe('assemblyGroupPathsOf', () => {
  it('walks a leaf back to its root, outermost first', () => {
    const paths = assemblyGroupPathsOf([
      node(100626, 'дискови спирачки', 100006),
      node(100032, 'спирачен диск', 100626),
      node(100006, 'спирачна уредба'),
    ]);

    expect(trails(paths)).toEqual([
      ['спирачна уредба', 'дискови спирачки', 'спирачен диск'],
    ]);
  });

  // TecDoc's tree files one part under several orthogonal axes at once — what
  // it is, where it sits on the car, why it is replaced. This is the facet the
  // live catalogue answers for MAHLE OX 389/1D.
  it('answers with every trail that reaches the article', () => {
    const paths = assemblyGroupPathsOf([
      node(100002, 'двигател'),
      node(100259, 'маслен филтър', 100005),
      node(100470, 'маслен филтър', 100245),
      node(100597, 'Периодична подмяна', 100019),
      node(100245, 'смазване', 100002),
      node(100005, 'филтър'),
      node(100019, 'части за сервиз/ инспекция/ обслужване'),
    ]);

    expect(trails(paths)).toEqual([
      ['филтър', 'маслен филтър'],
      ['двигател', 'смазване', 'маслен филтър'],
      ['части за сервиз/ инспекция/ обслужване', 'Периодична подмяна'],
    ]);
  });

  it('carries the node id the category filter takes', () => {
    const paths = assemblyGroupPathsOf([
      node(100259, 'маслен филтър', 100005),
      node(100005, 'филтър'),
    ]);

    expect(paths[0].map((step) => step.id)).toEqual(['100005', '100259']);
  });

  // A node that is somebody's parent is a step on the way to a deeper leaf, not
  // a trail's end — emitting it too would give one article the same trail twice,
  // once truncated.
  it('starts a trail only where nothing hangs below it', () => {
    const paths = assemblyGroupPathsOf([
      node(100005, 'филтър'),
      node(100259, 'маслен филтър', 100005),
    ]);

    expect(paths).toHaveLength(1);
  });

  it('has no trail for an article TecDoc files under nothing', () => {
    expect(assemblyGroupPathsOf([])).toEqual([]);
    expect(assemblyGroupPathsOf()).toEqual([]);
  });

  // The facet is scoped to the match set, so a parent it did not return leaves
  // a trail that simply starts lower rather than one that is dropped.
  it('keeps a trail whose parent is missing from the facet', () => {
    const paths = assemblyGroupPathsOf([node(100259, 'маслен филтър', 100005)]);

    expect(trails(paths)).toEqual([['маслен филтър']]);
  });

  // `parentNodeId` arrives over an untyped JSON transport, so a chain that
  // loops back on itself would spin here rather than fail.
  it('stops on a parent chain that loops', () => {
    const paths = assemblyGroupPathsOf([
      node(1, 'a', 2),
      node(2, 'b', 1),
      node(3, 'c', 1),
    ]);

    expect(trails(paths)).toEqual([['b', 'a', 'c']]);
  });
});
