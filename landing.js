const root = document.documentElement;
const pinQuery = matchMedia(root.dataset.pin);
const motionQuery = matchMedia('(prefers-reduced-motion: no-preference)');
const navHeight = () => parseFloat(getComputedStyle(root).getPropertyValue('--nav'));

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const smooth = (amount) => amount * amount * (3 - 2 * amount);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const decodeImages = (element) => Promise.all($$('img', element).map((image) => {
  image.loading = 'eager';
  return image.decode().catch(() => {});
}));

const isPinned = () => pinQuery.matches;
const pinProgress = (scene) => {
  const box = scene.getBoundingClientRect();
  const stickyHeight = innerHeight - navHeight();
  return clamp((navHeight() - box.top) / (box.height - stickyHeight));
};

const scenes = [heroScene(), wordScene(), tourScene(), prismScene(), glassEdges()];
let frameQueued = false;

function render() {
  frameQueued = false;
  scenes.forEach((scene) => scene());
}

function queueRender() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(render);
}

addEventListener('scroll', queueRender, { passive: true });
addEventListener('resize', queueRender);
pinQuery.addEventListener('change', () => {
  root.classList.toggle('pin', pinQuery.matches);
  queueRender();
});
motionQuery.addEventListener('change', () => {
  root.classList.toggle('motion', motionQuery.matches);
  queueRender();
});

revealOnScroll();
compareSlider();
quickLook();
vaultDemo();
cardSpotlight();
iconTilt();
render();

function heroScene() {
  const scene = $('.hero-scene');
  const copy = $('.hero-copy');
  const frame = $('.hero-window');

  return () => {
    if (!isPinned()) {
      copy.removeAttribute('style');
      frame.removeAttribute('style');
      return;
    }
    const progress = pinProgress(scene);
    const settle = smooth(clamp(progress / 0.8));
    const fade = clamp(progress / 0.3);
    const startY = copy.offsetTop + copy.offsetHeight + 34;
    const endY = (innerHeight - navHeight() - frame.offsetHeight) / 2;

    frame.style.transform = `translate(-50%, ${mix(startY, endY, settle)}px) perspective(1700px) rotateX(${mix(26, 0, settle)}deg) scale(${mix(0.84, 1, settle)})`;
    frame.style.setProperty('--glow', mix(0.4, 1, settle));
    copy.style.opacity = 1 - fade;
    copy.style.transform = `translateY(${-70 * fade}px) scale(${1 - 0.03 * fade})`;
    copy.style.visibility = fade === 1 ? 'hidden' : '';
  };
}

function wordScene() {
  const block = $('[data-words]');
  const words = block.textContent.trim().split(/\s+/).map((text) => {
    const word = document.createElement('span');
    word.className = 'word';
    word.textContent = text;
    return word;
  });
  block.replaceChildren(...words.flatMap((word) => [word, ' ']));

  return () => {
    if (!motionQuery.matches) {
      words.forEach((word) => { word.style.opacity = 1; });
      return;
    }
    const box = block.getBoundingClientRect();
    const progress = clamp((innerHeight * 0.82 - box.top) / (box.height + innerHeight * 0.2));
    const lit = progress * (words.length + 4);
    words.forEach((word, index) => {
      word.style.opacity = mix(0.16, 1, clamp(lit - index));
    });
  };
}

function tourScene() {
  const scene = $('.tour-scene');
  const chapters = $$('.chapter', scene);
  const frames = $$('.tour-frame', scene);
  const pills = frames.map((frame) => outlinePill($('.tour-pill', frame)));
  const syncButtons = () => chapters.forEach((chapter) => { $('button', chapter).disabled = !isPinned(); });
  let active = 0;

  syncButtons();
  pinQuery.addEventListener('change', syncButtons);
  const preload = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || !isPinned()) return;
    preload.disconnect();
    decodeImages($('.tour-stage', scene));
  }, { rootMargin: '100% 0px' });
  preload.observe(scene);
  chapters.forEach((chapter, index) => {
    $('button', chapter).addEventListener('click', (event) => {
      if (!isPinned()) return;
      if (event.detail) event.currentTarget.blur();
      const box = scene.getBoundingClientRect();
      const travel = box.height - (innerHeight - navHeight());
      const top = scrollY + box.top - navHeight() + (travel * (index + 0.04)) / chapters.length;
      scrollTo({ top, behavior: motionQuery.matches ? 'smooth' : 'auto' });
    });
  });

  return () => {
    if (!isPinned()) return;
    const position = pinProgress(scene) * chapters.length;
    const current = Math.min(chapters.length - 1, Math.floor(position));
    chapters.forEach((chapter, index) => {
      const progress = clamp(position - index);
      chapter.style.setProperty('--fill', progress);
      const scroll = smooth(clamp((progress - 0.12) / 0.76));
      frames[index].style.setProperty('--scroll', scroll);
      pills[index](scroll);
    });
    if (current === active) return;
    chapters[active].classList.remove('is-active');
    frames[active].classList.remove('is-active');
    chapters[current].classList.add('is-active');
    frames[current].classList.add('is-active');
    active = current;
  };
}

// Same rules as the app: updateCurrentHeading in markus-bootstrap.js, the idle shrink in OutlinePill.swift.
function outlinePill(pill) {
  if (!pill) return () => {};
  const bars = $$('i', pill);
  const tops = pill.dataset.tops.split(' ').map(Number);
  const [start, travel, viewport, length] = pill.dataset.scroll.split(' ').map(Number);
  let current = -1;
  let idle;

  return (scroll) => {
    const y = start + scroll * travel;
    const heading = y + viewport >= length - 4 ? tops.length - 1
      : y < 8 ? 0
      : Math.max(0, tops.findLastIndex((top) => top - y <= 100));
    if (heading === current) return;
    bars[current]?.classList.remove('is-current');
    bars[heading].classList.add('is-current');
    if (current >= 0) {
      pill.classList.add('is-moving');
      clearTimeout(idle);
      idle = setTimeout(() => pill.classList.remove('is-moving'), 900);
    }
    current = heading;
  };
}

function glassEdges() {
  if (!motionQuery.matches) return () => {};
  const visible = new Set();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => visible[entry.isIntersecting ? 'add' : 'delete'](entry.target));
    queueRender();
  }, { rootMargin: '10% 0px' });
  $$('.window, .card, .ql-stage, .vpanel').forEach((pane) => observer.observe(pane));

  return () => {
    const drift = Math.sin(scrollY / 380) * 14;
    visible.forEach((pane) => {
      const box = pane.getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      const sweep = mix(46, -46, clamp(centerY / innerHeight));
      const spread = (centerX / innerWidth - 0.5) * 24;
      pane.style.setProperty('--light', `${clamp(sweep + spread + drift, -58, 58).toFixed(1)}deg`);
      pane.style.setProperty('--sheen', `${mix(125, -25, clamp(centerY / innerHeight)).toFixed(1)}%`);
    });
  };
}

function iconMask(name) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${$(`#i-${name}`).innerHTML}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function prismScene() {
  const scene = $('[data-prism]');
  const prism = $('.prism', scene);
  const looks = [
    ['folder', '#ff9400'], ['flask', '#b052de'], ['book', '#007aff'], ['leaf', '#4dd159'],
    ['heart', '#ff453b'], ['star', '#ffcc00'], ['folder', '#ff9400'],
  ];
  const stepTime = 210;
  let look = 0;
  let reached = 0;
  let played = false;
  let frame = 0;

  const show = (index) => {
    if (index === look) return;
    look = index;
    prism.style.setProperty('--icon', iconMask(looks[index][0]));
    prism.style.setProperty('--tint', looks[index][1]);
  };
  const refract = (amount, across) => {
    prism.style.setProperty('--sweep', `${mix(-32, 32, across).toFixed(1)}%`);
    prism.style.setProperty('--split', `${(amount * 8).toFixed(1)}px`);
    prism.style.setProperty('--solid', clamp(1 - amount * 1.8).toFixed(3));
    prism.style.setProperty('--caustic', amount.toFixed(3));
    prism.style.setProperty('--bloom', mix(0.26, 0.5, amount).toFixed(3));
  };
  const fringe = (amount) => {
    prism.style.setProperty('--split', `${(amount * 7).toFixed(1)}px`);
    prism.style.setProperty('--solid', clamp(1 - amount * 1.8).toFixed(3));
  };
  const playIcons = () => {
    played = true;
    refract(0, 1);
    prism.classList.add('is-cycling');
    const begin = performance.now();
    const steps = looks.length - 2;
    const tick = (now) => {
      const position = (now - begin) / stepTime;
      if (position >= steps) {
        show(looks.length - 1);
        fringe(0);
        prism.classList.remove('is-cycling');
        return;
      }
      const across = position % 1;
      show(1 + Math.floor(position) + (across >= 0.5 ? 1 : 0));
      fringe(Math.sin(across * Math.PI));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };

  return () => {
    if (!motionQuery.matches) return;
    if (scene.getBoundingClientRect().top >= innerHeight) {
      cancelAnimationFrame(frame);
      prism.classList.remove('is-cycling');
      reached = 0;
      played = false;
      show(0);
      refract(0, 0);
    }
    const box = prism.getBoundingClientRect();
    const progress = clamp((innerHeight * 0.9 - box.top - box.height / 2) / (innerHeight * 0.45));
    const scrollingBack = progress < reached - 0.04;
    reached = Math.max(reached, progress);
    prism.style.setProperty('--scale', mix(0.86, 1, smooth(clamp(reached / 0.6))).toFixed(3));
    prism.style.setProperty('--spin', `${(reached * 180).toFixed(1)}deg`);
    scene.style.setProperty('--shift', `${(reached * 50).toFixed(1)}%`);
    if (played) return;
    if (reached >= 1) return playIcons();
    show(reached >= 0.5 ? 1 : 0);
    refract(scrollingBack ? 0 : Math.sin(reached * Math.PI), reached);
  };
}

function vaultDemo() {
  const demo = $('[data-vaults]');
  const form = $('.vpanel', demo);
  const list = $('.vm-vaults', demo);
  const iconsBox = $('.vicons', demo);
  const chip = $('.vchip', demo);
  const icons = ['folder', 'book', 'terminal', 'flask', 'briefcase', 'bulb', 'heart', 'star', 'cap', 'leaf', 'cube', 'chart'];
  const vaults = [
    { name: 'Orbit', folder: 'Orbit', path: '~/Projects/orbit', icon: 'folder', color: '#ff9400', title: 'Architecture', section: 'docs', body: 'Every device keeps a full copy of the data and an append-only change log. Edits apply locally first, so the app never waits for the network.', next: 'Guarantees', list: ['Reads and writes never block on the network.', 'Two devices that saw the same changes hold the same data.'] },
    { name: 'Notes', folder: 'Notes', path: '~/Documents/Notes', icon: 'leaf', color: '#4dd159', title: 'Reading list', section: 'inbox', body: 'Long reads worth keeping, with a line on why each one mattered. Sorted by how often they come up in conversation.', next: 'This week', list: ['Finish the essay on maintenance.', 'Write down the three things worth remembering.'] },
    { name: 'Client work', folder: 'Clients', path: '~/Work/Clients', icon: 'briefcase', color: '#007aff', title: 'Kickoff notes', section: 'acme', body: 'Scope, people and the first three milestones, written down while everyone still agrees on them.', next: 'Decisions', list: ['Ship the first milestone by the end of the month.', 'Review the plan together every Thursday.'] },
    { name: 'Research', folder: 'Research', path: '~/Documents/Research', icon: 'flask', color: '#b052de', title: 'Sequence CRDTs', section: 'papers', body: 'How concurrent edits keep both authors\' text, and what each character\'s stable position costs in storage.', next: 'To read', list: ['A survey of sequence CRDTs in practice.', 'Notes on hybrid logical clocks.'] },
  ];
  let active = 0;

  iconsBox.innerHTML = icons.map((name) => `<label class="vicon" title="${name}"><input type="radio" name="vault-icon" value="${name}"><svg aria-hidden="true"><use href="#i-${name}"></use></svg></label>`).join('');
  list.innerHTML = vaults.map(() => '<button class="vm-vault" type="button"><svg aria-hidden="true"><use></use></svg><span></span></button>').join('');
  const rows = $$('.vm-vault', list);

  const refract = () => {
    if (!motionQuery.matches) return;
    demo.classList.remove('refract');
    void demo.offsetWidth;
    demo.classList.add('refract');
  };
  const paint = () => {
    const vault = vaults[active];
    demo.style.setProperty('--tint', vault.color || 'transparent');
    demo.style.setProperty('--chip', vault.color || '#8e8e93');
    demo.style.setProperty('--icon-tint', vault.color || '#fff');
    chip.style.setProperty('--tint', vault.color || '#f5f5f7');
    chip.style.setProperty('--icon', iconMask(vault.icon));
    rows.forEach((row, index) => {
      const item = vaults[index];
      row.classList.toggle('is-active', index === active);
      row.setAttribute('aria-pressed', String(index === active));
      row.style.setProperty('--row-tint', item.color || 'var(--m-text)');
      $('use', row).setAttribute('href', `#i-${item.icon}`);
      $('span', row).textContent = item.name || item.folder;
    });
    const name = vault.name || vault.folder;
    $$('.vm-doc-title', demo).forEach((element) => { element.textContent = vault.title; });
    $('.vm-tab-title', demo).textContent = vault.title;
    $('.vm-crumb', demo).textContent = `${name} › ${vault.section}`;
    $('.vm-doc-body', demo).textContent = vault.body;
    $('.vm-doc-next', demo).textContent = vault.next;
    $('.vm-doc-list', demo).replaceChildren(...vault.list.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    $('.vm-file', demo).textContent = `${vault.title}.md`;
    $('.vpanel-path', demo).textContent = vault.path;
  };
  const syncForm = () => {
    const vault = vaults[active];
    form.elements['vault-name'].value = vault.name;
    form.elements['vault-name'].placeholder = vault.folder;
    form.elements['vault-color'].value = vault.color;
    form.elements['vault-icon'].value = vault.icon;
  };

  rows.forEach((row, index) => row.addEventListener('click', () => {
    active = index;
    syncForm();
    paint();
    refract();
  }));
  form.addEventListener('input', (event) => {
    const vault = vaults[active];
    const { name, value } = event.target;
    if (name === 'vault-name') vault.name = value;
    if (name === 'vault-color') vault.color = value;
    if (name === 'vault-icon') vault.icon = value;
    if (name === 'app-accent') $('.vmock', demo).style.setProperty('--m-accent', value);
    paint();
    if (name === 'vault-color' || name === 'vault-icon') refract();
  });

  syncForm();
  paint();
}

function revealOnScroll() {
  const decoded = new Map();
  const prepare = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      prepare.unobserve(entry.target);
      decoded.set(entry.target, decodeImages(entry.target));
    });
  }, { rootMargin: '100% 0px' });
  const observer = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      observer.unobserve(entry.target);
      const images = decoded.get(entry.target) ?? decodeImages(entry.target);
      Promise.race([images, delay(1200)]).then(() => entry.target.classList.add('in'));
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal]').forEach((element) => {
    prepare.observe(element);
    observer.observe(element);
  });
}

function compareSlider() {
  const figure = $('[data-compare]');
  const input = $('input', figure);
  const narrowQuery = matchMedia('(max-width: 820px)');
  const stops = () => (narrowQuery.matches
    ? { start: 0, sweepTo: 20, rest: 52 }
    : { start: 35, sweepTo: 47, rest: 68 });
  let sweep = 0;

  const moveTo = (value) => {
    const { start, sweepTo } = stops();
    const position = clamp(value, start, 100);
    input.min = start;
    input.value = position;
    figure.style.setProperty('--pos', `${position}%`);
    figure.classList.toggle('at-page', position < sweepTo);
    figure.classList.toggle('at-source', position > 88);
  };
  const stopSweep = () => cancelAnimationFrame(sweep);
  const follow = (event) => {
    const box = figure.getBoundingClientRect();
    moveTo(clamp((event.clientX - box.left) / box.width) * 100);
  };
  narrowQuery.addEventListener('change', () => moveTo(stops().rest));

  figure.addEventListener('pointerdown', (event) => {
    stopSweep();
    figure.setPointerCapture(event.pointerId);
    figure.classList.add('dragging');
    follow(event);
  });
  figure.addEventListener('pointermove', (event) => {
    if (figure.hasPointerCapture(event.pointerId)) follow(event);
  });
  ['pointerup', 'pointercancel'].forEach((type) => {
    figure.addEventListener(type, () => figure.classList.remove('dragging'));
  });
  input.addEventListener('input', () => {
    stopSweep();
    moveTo(Number(input.value));
  });

  if (!motionQuery.matches) return moveTo(stops().rest);
  moveTo(97);
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    const { sweepTo, rest } = stops();
    const begin = performance.now() + 350;
    const step = (now) => {
      const elapsed = now - begin;
      const position = elapsed < 1400
        ? mix(97, sweepTo, smooth(clamp(elapsed / 1400)))
        : mix(sweepTo, rest, smooth(clamp((elapsed - 1400) / 900)));
      moveTo(position);
      if (elapsed < 2300) sweep = requestAnimationFrame(step);
    };
    sweep = requestAnimationFrame(step);
  }, { threshold: 0.6 });
  observer.observe(figure);
}

function quickLook() {
  const section = $('[data-quicklook]');
  const stage = $('.ql-stage', section);
  const key = $('.keycap', section);
  const preview = $('.ql-preview', section);
  const grid = $('.ql-files', section);
  const files = $$('input', grid);
  let inView = false;

  const isOpen = () => section.classList.contains('open');
  const selected = () => files.find((file) => file.checked);
  const showSelected = () => {
    const file = selected();
    const icon = $('i', file.parentElement).getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    preview.src = file.dataset.shot;
    preview.alt = file.dataset.alt;
    preview.style.transformOrigin = `${((icon.left + icon.width / 2 - box.left) / box.width) * 100}% ${((icon.top + icon.height / 2 - box.top) / box.height) * 100}%`;
  };
  const setOpen = (open) => {
    if (open) showSelected();
    section.classList.toggle('open', open);
    key.setAttribute('aria-pressed', String(open));
    key.setAttribute('aria-label', open ? 'Close the Quick Look preview' : 'Show the Quick Look preview');
  };
  const moveSelection = (arrow) => {
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[arrow];
    const next = files[files.indexOf(selected()) + step];
    if (!next) return false;
    next.checked = true;
    showSelected();
    return true;
  };

  files.forEach((file) => file.addEventListener('change', showSelected));
  grid.addEventListener('dblclick', () => setOpen(true));
  stage.addEventListener('click', () => {
    if (isOpen()) setOpen(false);
  });
  key.addEventListener('click', () => setOpen(!isOpen()));
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView) setOpen(false);
  }, { threshold: 0.5 }).observe(stage);
  const preload = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    preload.disconnect();
    files.forEach((file) => { new Image().src = file.dataset.shot; });
  }, { rootMargin: '600px 0px' });
  preload.observe(stage);

  addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
    const onFile = event.target.parentElement?.classList.contains('ql-file');
    const onControl = !onFile && event.target.closest?.('a, button, input, select, textarea, summary, [tabindex]');
    if (!inView || onControl || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.startsWith('Arrow')) {
      if (moveSelection(event.key) || onFile) event.preventDefault();
      return;
    }
    if (event.code !== 'Space' || event.shiftKey) return;
    event.preventDefault();
    if (event.repeat) return;
    key.classList.add('down');
    setOpen(!isOpen());
  });
  addEventListener('keyup', (event) => {
    if (event.code === 'Space') key.classList.remove('down');
  });
}

function cardSpotlight() {
  $$('.card').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const box = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - box.left}px`);
      card.style.setProperty('--my', `${event.clientY - box.top}px`);
    });
  });
}

function iconTilt() {
  if (!motionQuery.matches || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const hero = $('.hero-sticky');
  const icon = $('.hero-copy .app-icon');

  hero.addEventListener('pointermove', (event) => {
    const box = icon.getBoundingClientRect();
    const across = clamp((event.clientX - box.left - box.width / 2) / (innerWidth / 2), -1, 1);
    const down = clamp((event.clientY - box.top - box.height / 2) / (innerHeight / 2), -1, 1);
    icon.style.setProperty('--ry', `${across * 22}deg`);
    icon.style.setProperty('--rx', `${down * -22}deg`);
  });
  hero.addEventListener('pointerleave', () => {
    icon.style.setProperty('--ry', '0deg');
    icon.style.setProperty('--rx', '0deg');
  });
}
