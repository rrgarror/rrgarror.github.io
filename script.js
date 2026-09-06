"use strict";

const canvas = document.querySelector("#visual-canvas");
const siteHeader = document.querySelector(".site-header");
const researchSection = document.querySelector("#research");

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

const smoothstep = (start, end, value) => {
  const amount = clamp((value - start) / (end - start));
  return amount * amount * (3 - 2 * amount);
};

let visualPageEnd = 1;
let visualResearchEndScroll = 1;

function updateVisualMetrics() {
  visualPageEnd = Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    1,
  );
  const researchEnd = researchSection
    ? researchSection.offsetTop + researchSection.offsetHeight
    : visualPageEnd * 0.5;
  visualResearchEndScroll = clamp(
    researchEnd - window.innerHeight,
    1,
    Math.max(visualPageEnd - 1, 1),
  );
}

function getVisualProgress() {
  const currentScroll = clamp(window.scrollY, 0, visualPageEnd);

  // The wireframe is reached only as Research finishes entering the
  // viewport. The junction vocabulary is reached only at the page end.
  if (currentScroll <= visualResearchEndScroll) {
    return 0.5 * clamp(currentScroll / visualResearchEndScroll);
  }

  return 0.5 + 0.5 * clamp(
    (currentScroll - visualResearchEndScroll) /
      Math.max(visualPageEnd - visualResearchEndScroll, 1),
  );
}

updateVisualMetrics();

if (canvas) {
  const context = canvas.getContext("2d", {
    alpha: true,
    desynchronized: true,
  });
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactViewportQuery = window.matchMedia("(max-width: 760px)");

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let targetProgress = getVisualProgress();
  let displayedProgress = targetProgress;
  let frameRequest = null;
  let resizeRequest = null;

  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const objectVertices = [
    [-1, goldenRatio, 0],
    [1, goldenRatio, 0],
    [-1, -goldenRatio, 0],
    [1, -goldenRatio, 0],
    [0, -1, goldenRatio],
    [0, 1, goldenRatio],
    [0, -1, -goldenRatio],
    [0, 1, -goldenRatio],
    [goldenRatio, 0, -1],
    [goldenRatio, 0, 1],
    [-goldenRatio, 0, -1],
    [-goldenRatio, 0, 1],
  ];

  const objectEdges = [];

  for (let first = 0; first < objectVertices.length; first += 1) {
    for (let second = first + 1; second < objectVertices.length; second += 1) {
      const a = objectVertices[first];
      const b = objectVertices[second];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

      if (distance < 2.1) {
        objectEdges.push([first, second]);
      }
    }
  }

  const edgeKeys = new Set(
    objectEdges.map(([first, second]) => `${Math.min(first, second)}-${Math.max(first, second)}`),
  );
  const objectFaces = [];

  for (let first = 0; first < objectVertices.length; first += 1) {
    for (let second = first + 1; second < objectVertices.length; second += 1) {
      for (let third = second + 1; third < objectVertices.length; third += 1) {
        const pairs = [
          `${first}-${second}`,
          `${first}-${third}`,
          `${second}-${third}`,
        ];

        if (pairs.every((pair) => edgeKeys.has(pair))) {
          objectFaces.push([first, second, third]);
        }
      }
    }
  }

  // Canonical line-junction vocabulary adapted from the supplied figures.
  // The shared centers sit on an exact three-column by two-row grid.
  const junctionPrimitives = [
    {
      name: "fork",
      center: [0.18, 0.34],
      rays: [
        [0, -0.105],
        [-0.08, 0.08],
        [0.08, 0.08],
      ],
    },
    {
      name: "arrow",
      center: [0.5, 0.34],
      rays: [
        [-0.085, -0.025],
        [-0.055, 0.075],
        [0.04, -0.115],
      ],
    },
    {
      name: "ell",
      center: [0.82, 0.34],
      rays: [
        [-0.05, -0.1],
        [0.09, 0],
      ],
    },
    {
      name: "psi",
      center: [0.18, 0.66],
      rays: [
        [0, -0.12],
        [-0.075, -0.075],
        [0.075, -0.075],
        [0, 0.105],
      ],
    },
    {
      name: "tee",
      center: [0.5, 0.66],
      rays: [
        [-0.09, 0],
        [0.09, 0],
        [0, 0.11],
      ],
    },
    {
      name: "peak",
      center: [0.82, 0.66],
      rays: [
        [-0.08, 0.08],
        [0.08, 0.08],
        [0, 0.12],
      ],
    },
  ];

  const targetSegments = junctionPrimitives.flatMap(({ center, rays }) =>
    rays.map(([offsetX, offsetY]) => [
      center[0],
      center[1],
      center[0] + offsetX,
      center[1] + offsetY,
    ]),
  );

  function resizeCanvas(force = false) {
    const nextWidth = window.innerWidth;
    const nextHeight = window.innerHeight;
    const isMobileToolbarResize =
      !force &&
      compactViewportQuery.matches &&
      width > 0 &&
      Math.abs(nextWidth - width) < 2 &&
      Math.abs(nextHeight - height) < 140;

    // Mobile address bars repeatedly change the viewport height while the
    // user scrolls. Rebuilding the canvas for each small change causes jank.
    if (isMobileToolbarResize) {
      targetProgress = getVisualProgress();
      requestRender();
      return;
    }

    width = nextWidth;
    height = nextHeight;
    pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      compactViewportQuery.matches ? 1.25 : 2,
    );
    updateVisualMetrics();
    targetProgress = getVisualProgress();

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    requestRender();
  }

  function rotateVertex(vertex, rotationX, rotationY) {
    const [x, y, z] = vertex;
    const cosY = Math.cos(rotationY);
    const sinY = Math.sin(rotationY);
    const rotatedX = x * cosY + z * sinY;
    const rotatedZ = -x * sinY + z * cosY;
    const cosX = Math.cos(rotationX);
    const sinX = Math.sin(rotationX);

    return [
      rotatedX,
      y * cosX - rotatedZ * sinX,
      y * sinX + rotatedZ * cosX,
    ];
  }

  function getProjectedObject(progress) {
    const scale = Math.min(width, height) * (width < 720 ? 0.16 : 0.22);
    const desktopCenter = width * (0.58 + smoothstep(0.1, 0.5, progress) * 0.2);
    const centerX = width < 900 ? width * 0.7 : desktopCenter;
    const centerY = height * 0.47;
    const rotationY = -0.52 + progress * 1.35;
    const rotationX = 0.3 - progress * 0.38;

    const points = objectVertices.map((vertex) => {
      const [x, y, z] = rotateVertex(vertex, rotationX, rotationY);
      const perspective = 3.9 / (4.9 - z * 0.5);

      return {
        x: centerX + x * scale * perspective,
        y: centerY + y * scale * perspective,
        z,
      };
    });

    return { points, centerX, centerY, scale };
  }

  function getTargetPoint(x, y) {
    const regionLeft = width < 900 ? width * 0.1 : width * 0.57;
    const regionWidth = width < 900 ? width * 0.8 : width * 0.38;
    const regionHeight = Math.min(regionWidth * 0.78, height * 0.58);
    const regionTop = (height - regionHeight) * 0.5;

    return {
      x: regionLeft + x * regionWidth,
      y: regionTop + y * regionHeight,
    };
  }

  function getTargetSegment(index) {
    const [x1, y1, x2, y2] = targetSegments[index % targetSegments.length];

    return {
      first: getTargetPoint(x1, y1),
      second: getTargetPoint(x2, y2),
    };
  }

  function mixPoint(first, second, amount) {
    return {
      x: first.x + (second.x - first.x) * amount,
      y: first.y + (second.y - first.y) * amount,
      z: first.z ?? 0,
    };
  }

  function drawSolidFaces(points, opacity) {
    if (opacity <= 0.002) {
      return;
    }

    const orderedFaces = objectFaces
      .map((face) => ({
        face,
        depth: face.reduce((total, index) => total + points[index].z, 0) / 3,
      }))
      .sort((a, b) => a.depth - b.depth);

    context.save();
    context.globalAlpha = opacity;

    orderedFaces.forEach(({ face, depth }, index) => {
      const shade = clamp((depth + 2.6) / 5.2);
      const red = Math.round(211 + shade * 18);
      const green = Math.round(210 + shade * 17);
      const blue = Math.round(198 + shade * 18);
      const warmFace = index % 5 === 0;

      context.fillStyle = warmFace
        ? `rgb(${red + 2}, ${green - 2}, ${blue - 2})`
        : `rgb(${red}, ${green}, ${blue})`;
      context.beginPath();
      context.moveTo(points[face[0]].x, points[face[0]].y);
      context.lineTo(points[face[1]].x, points[face[1]].y);
      context.lineTo(points[face[2]].x, points[face[2]].y);
      context.closePath();
      context.fill();
    });

    const hull = points
      .slice()
      .sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (origin, a, b) =>
      (a.x - origin.x) * (b.y - origin.y) -
      (a.y - origin.y) * (b.x - origin.x);
    const lower = [];
    const upper = [];

    hull.forEach((point) => {
      while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) {
        lower.pop();
      }
      lower.push(point);
    });

    hull.slice().reverse().forEach((point) => {
      while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) {
        upper.pop();
      }
      upper.push(point);
    });

    const outline = lower.slice(0, -1).concat(upper.slice(0, -1));
    context.strokeStyle = "rgba(51, 54, 49, 0.14)";
    context.lineWidth = 0.9;
    context.beginPath();
    outline.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.closePath();
    context.stroke();

    context.restore();
  }

  function drawMorph(progress) {
    const { points, centerX, centerY, scale } = getProjectedObject(progress);
    const faceOpacity = 1 - smoothstep(0.04, 0.5, progress);
    const segmentMorph = smoothstep(0.5, 1, progress);
    const wireframeReveal = smoothstep(0.15, 0.5, progress);

    drawSolidFaces(points, faceOpacity);

    context.save();
    context.lineCap = "round";
    context.setLineDash([]);

    objectEdges.forEach(([firstIndex, secondIndex], edgeIndex) => {
      const target = getTargetSegment(edgeIndex);
      const first = mixPoint(points[firstIndex], target.first, segmentMorph);
      const second = mixPoint(points[secondIndex], target.second, segmentMorph);
      const depth = clamp((points[firstIndex].z + points[secondIndex].z + 5) / 10, 0.34, 1);
      const retainedAtTarget =
        edgeIndex < targetSegments.length ? 1 : 1 - segmentMorph;
      const lineOpacity =
        (0.17 + depth * 0.18) *
        Math.max(wireframeReveal, segmentMorph) *
        retainedAtTarget;

      if (lineOpacity <= 0.002) {
        return;
      }

      context.lineWidth = 0.75 + segmentMorph * 0.3;
      context.strokeStyle = `rgba(35, 40, 37, ${lineOpacity})`;
      context.beginPath();
      context.moveTo(first.x, first.y);
      context.lineTo(second.x, second.y);
      context.stroke();
    });

    if (segmentMorph < 0.55) {
      const pointOpacity =
        wireframeReveal * (1 - smoothstep(0.38, 0.56, progress));

      points.forEach((point) => {
        context.fillStyle = `rgba(138, 71, 55, ${0.5 * pointOpacity})`;
        context.beginPath();
        context.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
        context.fill();
      });

      context.strokeStyle = `rgba(115, 120, 99, ${0.15 * pointOpacity})`;
      context.setLineDash([3, 7]);
      context.beginPath();
      context.ellipse(centerX, centerY, scale * 1.05, scale * 0.3, -0.22, 0, Math.PI * 2);
      context.stroke();
    }

    context.restore();
  }

  function renderFrame() {
    const easing = reducedMotionQuery.matches
      ? 1
      : compactViewportQuery.matches
        ? 0.17
        : 0.09;
    displayedProgress += (targetProgress - displayedProgress) * easing;

    context.clearRect(0, 0, width, height);
    drawMorph(displayedProgress);

    if (Math.abs(targetProgress - displayedProgress) > 0.0005) {
      frameRequest = window.requestAnimationFrame(renderFrame);
    } else {
      displayedProgress = targetProgress;
      frameRequest = null;
    }
  }

  function requestRender() {
    if (frameRequest === null) {
      frameRequest = window.requestAnimationFrame(renderFrame);
    }
  }

  function handleScroll() {
    targetProgress = getVisualProgress();
    siteHeader?.classList.toggle("is-scrolled", window.scrollY > 24);
    requestRender();
  }

  function handleResize() {
    if (resizeRequest !== null) {
      return;
    }

    resizeRequest = window.requestAnimationFrame(() => {
      resizeRequest = null;
      resizeCanvas();
    });
  }

  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", handleResize, { passive: true });
  reducedMotionQuery.addEventListener?.("change", requestRender);
  compactViewportQuery.addEventListener?.("change", () => resizeCanvas(true));

  if ("ResizeObserver" in window) {
    const layoutObserver = new ResizeObserver(() => {
      updateVisualMetrics();
      targetProgress = getVisualProgress();
      requestRender();
    });

    layoutObserver.observe(document.body);
  }

  resizeCanvas(true);
  handleScroll();
}
