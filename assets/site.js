"use strict";

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function element(tag, text, css) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (css) node.className = css;
    return node;
  }

  const tidy = text => text.normalize("NFKC").trim().toLowerCase();

  function initNav() {
    const toggle = $(".menu-toggle");
    const nav = $("#primary-nav");
    const media = window.matchMedia("(max-width: 640px)");
    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      nav.hidden = media.matches && !open;
    }
    function sync() {
      toggle.hidden = !media.matches;
      setOpen(false);
    }
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    nav.addEventListener("click", event => {
      const link = event.target.closest("a");
      if (!link || !media.matches) return;
      setOpen(false);
      const section = document.getElementById(link.hash.slice(1));
      if (section) {
        section.setAttribute("tabindex", "-1");
        section.focus({preventScroll: true});
      }
    });
    nav.addEventListener("keydown", event => {
      if (event.key === "Escape" && media.matches) {
        setOpen(false);
        toggle.focus();
      }
    });
    media.addEventListener("change", sync);
    sync();
  }

  function initCaseFilters() {
    const form = $("#case-filters");
    const cases = $$("#project-list .case-record").map(card => {
      const tag = $(".case-meta .tag", card);
      const amount = $(".case-amount", card);
      return {card, tag, amount, initial: [tag.dataset.kind, tag.textContent, amount.textContent],
        prices: $$(".price-detail", card).map(row => [
          $(".tag", row).dataset.kind, $(".tag", row).textContent, $(".amount", row).textContent
        ])};
    });
    const status = $("#project-count");
    const empty = $("#project-empty");
    function refresh() {
      const filter = Object.fromEntries(new FormData(form));
      const tokens = tidy(filter.search).split(/\s+/).filter(Boolean);
      let count = 0;
      for (const {card, tag, amount, initial, prices} of cases) {
        const d = card.dataset;
        card.hidden = !(
          tokens.every(token => tidy(d.search).includes(token))
          && ["buyer", "type", "year", "scene"].every(key => !filter[key] || filter[key] === d[key])
          && (!filter.kind || d.kinds.split(" ").includes(filter.kind))
        );
        if (card.hidden) continue;
        count += 1;
        const matches = prices.filter(([kind]) => kind === filter.kind);
        const [kind, label, value] = matches.length ? matches[0] : initial;
        tag.dataset.kind = kind;
        tag.textContent = label;
        amount.textContent = matches.length > 1 ? matches.length + " 条相关记录，展开查看" : value;
      }
      status.textContent = "显示 " + count + " / " + cases.length + " 个研究项目";
      empty.hidden = count > 0;
    }
    form.addEventListener("submit", event => event.preventDefault());
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    form.addEventListener("reset", () => requestAnimationFrame(refresh));
    form.hidden = false;
    refresh();
    return () => { form.reset(); refresh(); };
  }

  function initPriorEvidence() {
    const select = $("#price-kind");
    const cards = $$("#price-cases > article");
    function refresh() {
      let visible = 0;
      for (const card of cards) {
        card.hidden = select.value !== "all" && card.dataset.kind !== select.value;
        if (!card.hidden) visible += 1;
      }
      $("#case-status").textContent = "显示 " + visible + " 条精选证据";
    }
    select.addEventListener("change", refresh);
    select.closest(".case-toolbar").hidden = false;
    refresh();
  }

  function initChoosers() {
    for (const section of $$("[data-chooser]")) {
      const control = $("[data-choice]", section);
      const panels = $$("[data-panel]", section);
      function update() {
        for (const panel of panels) panel.hidden = panel.dataset.panel !== control.value;
      }
      control.addEventListener("change", update);
      control.parentElement.hidden = false;
      update();
    }
  }

  function initComparison(data, rules) {
    const status = $("#pair-status");
    const output = $("#pair-table");
    const input = $(".pair-select");
    const left = $('select[name="left"]', input);
    const right = $('select[name="right"]', input);
    const cases = new Map(data.cases.map(item => [item.id, item]));
    function render() {
      const a = cases.get(left.value);
      const b = cases.get(right.value);
      const result = rules.caseComparison(a, b, data.pairs);
      const note = element("aside", "", "note comparison-note");
      note.append(element("h4", result.title), element("p", result.explanation));
      const table = element("table", "", "comparison-table");
      table.append(element("caption", "项目合同属性与证据"));
      const header = table.createTHead().insertRow();
      for (const item of [null, a, b]) {
        const col = element("th");
        col.scope = "col";
        if (item) {
          const link = element("a", item.id + " · " + item.buyer);
          link.href = "#case-" + item.id;
          col.append(link);
        } else {
          col.textContent = "比较维度";
        }
        header.append(col);
      }
      const body = table.createTBody();
      for (const key of Object.keys(a.fields)) {
        const row = body.insertRow();
        const label = element("th", key);
        label.scope = "row";
        row.append(label);
        row.insertCell().textContent = a.fields[key];
        row.insertCell().textContent = b.fields[key];
      }
      const refs = body.insertRow();
      const refLabel = element("th", "证据编号");
      refLabel.scope = "row";
      refs.append(refLabel);
      for (const item of [a, b]) refs.insertCell().textContent = item.evidence.join("、");
      status.replaceChildren(note);
      output.replaceChildren(table);
    }
    input.addEventListener("change", render);
    input.hidden = false;
    render();
  }

  function initTools(rules) {
    const handlers = {A: rules.assetChecklist, B: rules.compareInputs, C: rules.transparency};
    for (const form of $$(".research-form")) {
      const output = $(".tool-result", form);
      form.addEventListener("submit", event => {
        event.preventDefault();
        const result = handlers[form.dataset.tool](Object.fromEntries(new FormData(form)));
        const list = element("ul");
        for (const item of result.items) list.append(element("li", item));
        output.replaceChildren(element("h4", result.title), element("p", result.explanation), list);
        output.hidden = false;
        output.focus({preventScroll: true});
        output.scrollIntoView({block: "nearest"});
      });
      form.addEventListener("reset", () => {
        output.hidden = true;
        output.replaceChildren();
      });
      form.hidden = false;
    }
  }

  function initGraphZoom() {
    for (const details of $$(".diagram")) {
      const picture = $("img", details);
      const viewport = element("div", "", "graph-viewport");
      viewport.tabIndex = 0;
      viewport.setAttribute("role", "group");
      viewport.setAttribute("aria-label", picture.alt + "。放大后可滚动查看。");
      viewport.dataset.scale = "1";
      picture.before(viewport);
      viewport.append(picture);
      const toolbar = element("div", "", "graph-tools");
      const levels = [["1", "适应宽度"], ["2", "放大查看"], ["3", "进一步放大"]];
      for (const [scale, label] of levels) {
        const button = element("button", label, "button subdued");
        button.type = "button";
        button.setAttribute("aria-pressed", String(scale === "1"));
        button.addEventListener("click", () => {
          viewport.dataset.scale = scale;
          viewport.scrollLeft = 0;
          for (const control of toolbar.children) control.setAttribute("aria-pressed", String(control === button));
        });
        toolbar.append(button);
      }
      viewport.before(toolbar);
    }
  }

  function initHash(resetCases) {
    function reveal(hash) {
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      if (target.matches(".case-record")) {
        if (target.hidden) resetCases();
        $("details", target).open = true;
      }
      if (target.matches("[data-panel]")) {
        const choice = $("[data-choice]", target.closest("[data-chooser]"));
        choice.value = target.dataset.panel;
        choice.dispatchEvent(new Event("change"));
      }
      if (target.matches("details")) target.open = true;
      for (let parent = target.parentElement; parent; parent = parent.parentElement) {
        if (parent.matches("details")) parent.open = true;
      }
    }
    document.addEventListener("click", event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      if (link.hash === "#top" && link.closest(".site-footer")) {
        event.preventDefault();
        if (location.hash !== "#top") history.pushState(null, "", "#top");
        window.scrollTo(0, 0);
        $(".brand").focus({preventScroll: true});
        return;
      }
      reveal(link.hash);
    });
    window.addEventListener("hashchange", () => reveal(location.hash));
    reveal(location.hash);
  }

  initNav();
  const clearCases = initCaseFilters();
  initPriorEvidence();
  initChoosers();
  initGraphZoom();
  initComparison(globalThis.ResearchData, globalThis.ResearchRules);
  initTools(globalThis.ResearchRules);
  initHash(clearCases);
})();
