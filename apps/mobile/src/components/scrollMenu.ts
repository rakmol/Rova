// Accumulate deliberate movement; ignore bounce and tiny direction changes.
export function scrollMenu(onHidden: (hidden: boolean) => void) {
  let previous = 0, travel = 0, direction = 0;
  return (offset: number) => {
    const y = Math.max(0, offset), delta = y - previous;
    previous = y;
    if (y <= 20) { travel = 0; direction = 0; onHidden(false); return; }
    if (Math.abs(delta) < 2) return;
    const next = Math.sign(delta);
    travel = next === direction ? travel + Math.abs(delta) : Math.abs(delta);
    direction = next;
    if (travel >= 20) { onHidden(next > 0); travel = 0; }
  };
}
