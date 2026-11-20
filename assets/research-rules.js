"use strict";

// V0.3 appendix C. Rules classify evidence supplied by the user.

globalThis.ResearchRules = (() => {
  const at = [
    ["AT01", "分析对象"], ["AT02", "项目与金额"], ["AT03", "权利链"],
    ["AT04", "覆盖与质量"], ["AT05", "数量与模块"], ["AT06", "期限与交付"],
    ["AT07", "持续服务"], ["AT08", "替代方案"], ["AT09", "成本与风险"], ["AT10", "收益与基线"],
  ];
  const normalize = value => (value || "").normalize("NFKC").trim().toLowerCase();
  const unknown = /^(?:未公开|待核实|不适用|未知|暂无|不详|无|待补|n\/?a|tbd|[-—\/?.]+|0)$/i;
  const documented = value => {
    const text = normalize(value);
    return Boolean(text && !unknown.test(text.replace(/[。！!]+$/, "")));
  };

  function assetChecklist(input) {
    const rows = at.map(([id, label]) => {
      const entry = (input[id] || "").trim();
      const status = ["未公开", "不适用"].includes(entry) ? entry
        : !documented(entry) ? "待核实" : "已填 · 待复核";
      return {id, label, status};
    });
    const missing = rows.filter(row => row.status === "待核实" || row.status === "未公开");
    const objectNeedsReview = !input.purpose || !documented(input.object)
      || [rows[0], rows[2]].some(row => row.status !== "已填 · 待复核");
    return {
      title: objectNeedsReview ? "先核查目的、估值对象与权利链" : "已形成核查清单",
      explanation: "AT01、AT03 要求先识别具体权利和服务包。已填写项还需核对原文。本工具不计算估值。",
      items: [
        "须补证 " + (missing.length ? missing.map(row => row.id + " " + row.label).join("、") : "无空白或明确缺失项"),
        ...rows.map(row => row.id + " " + row.label + " · " + row.status),
      ],
    };
  }

  function compareInputs(input) {
    const required = [
      ["family", "产品家族与用途"], ["term", "期限"], ["currencyUnit", "币种与计价单位"],
    ];
    const differences = required.filter(([key]) => input[key] !== "yes")
      .map(([key, label]) => label + (input[key] === "no" ? "存在关键差异或缺失" : "待核实"));
    const entry = [
      ["deals", "双方的成交性质"], ["independent", "是否为独立项目"],
    ];
    if (entry.some(([key]) => input[key] === "no")) {
      return {
        title: "不具备成交比价资格",
        explanation: "PC01 · 预算、报价等需与成交分开；同项目的分项与税口径先归并。",
        items: entry.filter(([key]) => input[key] === "no").map(([, label]) => label + "不满足"),
      };
    }
    if (!documented(input.left) || !documented(input.right) || entry.some(([key]) => input[key] !== "yes")) {
      return {title: "入口条件待核查", explanation: "PC01 · 先识别双方并确认是两个独立成交。",
        items: ["补齐比较记录、实际成交证据及项目标识。"]};
    }
    if (normalize(input.left) === normalize(input.right)) {
      return {title: "两条记录标识相同", explanation: "PC01 · 核查是否重复选取同一项目。",
        items: ["仅在能区分两个独立项目时继续比价。"]};
    }
    if (differences.length) {
      return {title: "当前 C · 无法直接比较", explanation: "PC02 · 关键比较条件缺失或不一致。",
        items: differences};
    }
    if (input.details === "yes" && documented(input.citation)) {
      return {title: "A 候选 · 有条件数值比较", explanation: "PC04 · 根据填写判断，阻断项均已解除，并记录了原文依据。独立复核后方可采用。",
        items: ["核实调整证据和适用条件；记录比较范围及限制。"]};
    }
    return {
      title: "B · 仅供结构比较",
      explanation: "PC03、PC05 · 产品、用途与期限满足入口条件，合同属性或原文依据仍需补核。",
      items: ["核对模块、数量、授权、税费、维护和折扣，并补原文或调整依据。"],
    };
  }

  function transparency(input) {
    const stages = ["机制名称", "计量基数", "比例与责任", "实际结算", "审计核验"];
    const firstGap = stages.findIndex((_, index) => input["T" + (index + 1)] !== "yes");
    const level = firstGap === -1 ? stages.length : firstGap;
    const next = level === 5 ? "已填写完整披露链，进入独立核验。"
      : "先补 T" + (level + 1) + " " + stages[level] + "。更高层的材料须在前级满足后评估。";
    return {
      title: "T" + level + " · " + (level ? stages[level - 1] : "无可核验安排"),
      explanation: level ? "按本人填报的连续披露条件判断。结论限于披露程度。"
        : "机制层尚未证实。T0仅表示可核验证据不足。",
      items: [next, ...stages.map((label, i) => {
        const state = input["T" + (i + 1)];
        return "T" + (i + 1) + " " + label + " · " + (state === "yes" ? "填报满足" : state === "no" ? "不满足" : "待核实");
      })],
    };
  }

  function caseComparison(left, right, pairs) {
    if (left.id === right.id) {
      return {title: "同一项目 · 无独立比价条件", explanation: "PC01 · 请选择两个不同项目。"};
    }
    const notDeals = [left, right].filter(item => !["deal", "final"].includes(item.kind));
    if (notDeals.length) {
      return {title: "不具备成交比价资格",
        explanation: "PC01 · " + notDeals.map(item => item.id + "：" + item.fields["金额性质"]).join("；") + "。可查阅资料结构。"};
    }
    if (left.currency !== right.currency) {
      return {title: "C · 币种口径不同", explanation: "PC02 · 保留项目原币和期限，无统一调整依据。"};
    }
    if ([left, right].some(item => item.fields["期限"] === "未公开")) {
      return {title: "C · 服务期限未公开", explanation: "PC02 · 缺关键期限，目前无法直接比价。"};
    }
    const existing = pairs[[left.id, right.id].sort().join("|")];
    const differences = ["计价单位", "期限"].filter(key => left.fields[key] !== right.fields[key]);
    const boundary = differences.length
      ? differences.join("、") + "的记载口径不同，需依据原文核对。"
      : "";
    if (existing) {
      return {title: "B · 仅供结构比较", explanation: boundary + existing.map(row => row.id + " · " + row.reason).join("。") + "。"};
    }
    return {title: "可比性待核查", explanation: boundary + "现有评估未提供此组合的直接数值比较结论。请核对同配置、期限、权利、税费与服务证据。"};
  }

  return Object.freeze({assetChecklist, compareInputs, transparency, caseComparison});
})();
