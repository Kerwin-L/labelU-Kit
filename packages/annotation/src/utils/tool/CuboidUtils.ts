import LineToolUtils, { IBasicLine } from '@/utils/tool/LineToolUtils';

export function getFrontCoordinate(box3d: ICuboid) {
  return {
    topLeft: {
      x: box3d.x,
      y: box3d.y,
    },
    bottomLeft: {
      x: box3d.x,
      y: box3d.y + box3d.height,
    },
    bottomRight: {
      x: box3d.x + box3d.width,
      y: box3d.y + box3d.height,
    },
    topRight: {
      x: box3d.x + box3d.width,
      y: box3d.y,
    },
  };
}

export function getBackCoordinate(box3d: ICuboid) {
  const frontPoints = getFrontCoordinate(box3d);
  const { topRight, bottomRight, bottomLeft, topLeft } = frontPoints;

  // TODO
  const { bottom, top } = box3d.sideLine;

  // Right
  const lineA: IBasicLine = {
    pointA: bottomRight,
    pointB: bottom,
  };
  const lineB: IBasicLine = {
    pointA: topRight,
    pointB: top,
  };

  console.log('lineA', lineA, lineB, box3d);
  const intersection = LineToolUtils.lineIntersection(lineA, lineB);

  // Parallel
  if (!intersection) {
    const newTopLeft = {
      x: top.x - box3d.width, // TODO. Need to think other sider
      y: top.y,
    };
    const newBottomLeft = {
      x: bottom.x - box3d.width,
      y: bottom.y,
    };

    return {
      topRight: top,
      bottomRight: bottom,
      topLeft: {
        x: top.x - box3d.width, // TODO. Need to think other sider
        y: top.y,
      },
      bottomLeft: {
        x: bottom.x - box3d.width,
        y: bottom.y,
      },
      sideLine: [
        {
          p1: bottomRight,
          p2: bottom,
        },
        {
          p1: topRight,
          p2: top,
        },
        {
          p1: bottomLeft,
          p2: newBottomLeft,
        },
        {
          p1: topLeft,
          p2: newTopLeft,
        },
      ],
      frontPoints,
    };
  }

  const x4 = {
    x: bottom.x - (bottomRight.x - bottomLeft.x),
    y: bottom.y - (bottomRight.y - bottomLeft.y),
  };

  const newIntersection = LineToolUtils.lineIntersection(
    { pointA: bottomLeft, pointB: intersection },
    { pointA: bottom, pointB: x4 },
  );

  if (!newIntersection) {
    return;
  }

  const newWidth = bottom.x - newIntersection.x;

  const newTopLeft = {
    x: top.x - newWidth, // TODO. Need to think other sider
    y: top.y,
  };
  const newBottomLeft = {
    x: bottom.x - newWidth,
    y: bottom.y,
  };

  return {
    topRight: top,
    bottomRight: bottom,
    topLeft: newTopLeft,
    bottomLeft: newBottomLeft,

    sideLine: [
      {
        p1: bottomRight,
        p2: bottom,
      },
      {
        p1: topRight,
        p2: top,
      },
      {
        p1: bottomLeft,
        p2: newBottomLeft,
      },
      {
        p1: topLeft,
        p2: newTopLeft,
      },
    ],
  };
}
