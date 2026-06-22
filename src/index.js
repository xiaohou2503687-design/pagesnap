const { chromium } = require("playwright");
const chalk = require("chalk");
const path = require("path");
const fs = require("fs");

// CRO scoring rules
const RULES = {
  hero: {
    label: "Hero Section",
    weight: 25,
    checks: [
      { id: "h1_exists", desc: "Has H1 tag", check: (page) => page.querySelector("h1") !== null },
      { id: "cta_visible", desc: "CTA button visible above fold", check: (page) => {
        const btns = Array.from(page.querySelectorAll("a, button"));
        return btns.some(b => {
          const rect = b.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.width > 60;
        });
      }},
      { id: "hero_image", desc: "Has hero image or illustration", check: (page) => {
        const imgs = Array.from(page.querySelectorAll("img"));
        return imgs.some(i => {
          const rect = i.getBoundingClientRect();
          return rect.top < window.innerHeight * 1.5 && rect.width > 200 && rect.height > 150;
        });
      }},
      { id: "headline_clarity", desc: "Headline under 80 chars", check: (page) => {
        const h1 = page.querySelector("h1");
        return h1 ? h1.textContent.trim().length < 80 : false;
      }}
    ]
  },
  socialProof: {
    label: "Social Proof",
    weight: 20,
    checks: [
      { id: "testimonials", desc: "Has testimonials or reviews", check: (page) => {
        const text = page.body.textContent.toLowerCase();
        return /testimonial|review|"|said|★★★★|rating/.test(text);
      }},
      { id: "user_count", desc: "Shows user/customer count", check: (page) => {
        const text = page.body.textContent.toLowerCase();
        return /\d+k?\s*(users|customers|developers|teams|companies)/.test(text);
      }},
      { id: "logos", desc: "Shows company/client logos", check: (page) => {
        const imgs = Array.from(page.querySelectorAll("img[alt]"));
        return imgs.some(i => /logo|partner|client|customer/i.test(i.alt));
      }}
    ]
  },
  pricing: {
    label: "Pricing & Trust",
    weight: 25,
    checks: [
      { id: "pricing_section", desc: "Has pricing section", check: (page) => {
        const text = page.body.textContent.toLowerCase();
        return /pricing|price|plan|\$|free|pro|enterprise/.test(text);
      }},
      { id: "guarantee", desc: "Shows money-back guarantee", check: (page) => {
        const text = page.body.textContent.toLowerCase();
        return /guarantee|refund|money.back|risk.free|no.risk/.test(text);
      }},
      { id: "faq", desc: "Has FAQ section", check: (page) => {
        return page.querySelectorAll("details, [class*=faq], [id*=faq]").length > 0 ||
               /FAQ|frequently.asked/i.test(page.body.textContent);
      }},
      { id: "contact_info", desc: "Has contact/support info", check: (page) => {
        const text = page.body.textContent.toLowerCase();
        return /contact|support|email|@|help/.test(text);
      }}
    ]
  },
  mobile: {
    label: "Mobile Experience",
    weight: 15,
    checks: [
      { id: "viewport", desc: "Has viewport meta tag", check: (page) => {
        return page.querySelector("meta[name=viewport]") !== null;
      }},
      { id: "responsive_images", desc: "Images have width/height attrs", check: (page) => {
        const imgs = Array.from(page.querySelectorAll("img"));
        if (imgs.length === 0) return true;
        return imgs.filter(i => i.width || i.getAttribute("width")).length / imgs.length > 0.5;
      }},
      { id: "tap_targets", desc: "Links spaced adequately (min 2 per content area)", check: (page) => {
        return page.querySelectorAll("a[href]").length >= 2;
      }}
    ]
  },
  speed: {
    label: "Performance",
    weight: 15,
    checks: [
      { id: "image_count", desc: "Under 30 images (no overload)", check: (page) => {
        return page.querySelectorAll("img").length < 30;
      }},
      { id: "no_mega_scripts", desc: "No excessive scripts (>15)", check: (page) => {
        return page.querySelectorAll("script[src]").length < 15;
      }},
      { id: "title_length", desc: "Title tag 30-65 chars", check: (page) => {
        const t = (page.querySelector("title")?.textContent || "").trim();
        return t.length >= 30 && t.length <= 65;
      }},
      { id: "meta_desc", desc: "Has meta description", check: (page) => {
        return page.querySelector("meta[name=description]") !== null;
      }}
    ]
  }
};

async function audit(url, options = {}) {
  console.log(chalk.cyan(`\n📸 PageSnap: Auditing ${chalk.bold(url)}...\n`));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 PageSnap-CRO-Auditor/0.1"
  });
  const page = await context.newPage();
  
  const startTime = Date.now();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  const loadTime = Date.now() - startTime;
  
  // Take screenshot
  let screenshotPath = null;
  if (options.output) {
    screenshotPath = path.resolve(options.output);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(chalk.green(`  ✓ Screenshot saved: ${screenshotPath}`));
  } else {
    const dir = path.join(process.cwd(), "pagesnap-output");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    screenshotPath = path.join(dir, `audit-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
  
  // Run all checks in browser context
  const results = {};
  let totalScore = 0;
  let maxScore = 0;
  let passed = 0;
  let total = 0;
  
  for (const [key, category] of Object.entries(RULES)) {
    const catResults = [];
    for (const check of category.checks) {
      total++;
      let ok = false;
      try {
        ok = await page.evaluate(check.check);
      } catch (e) {
        ok = false;
      }
      catResults.push({ id: check.id, desc: check.desc, pass: ok });
      if (ok) passed++;
    }
    const catPassed = catResults.filter(r => r.pass).length;
    const catScore = Math.round((catPassed / category.checks.length) * category.weight);
    totalScore += catScore;
    maxScore += category.weight;
    results[key] = { label: category.label, score: catScore, max: category.weight, checks: catResults };
  }
  
  // Performance bonus
  let perfBonus = 0;
  if (loadTime < 1500) perfBonus = 5;
  else if (loadTime < 3000) perfBonus = 3;
  else if (loadTime < 5000) perfBonus = 1;
  totalScore += perfBonus;
  
  const grade = totalScore >= 90 ? "A" : totalScore >= 75 ? "B" : totalScore >= 60 ? "C" : totalScore >= 40 ? "D" : "F";
  
  // Display report
  console.log(chalk.bold(`\n📊 CRO Audit Report — Grade: ${grade === "A" || grade === "B" ? chalk.green(grade) : grade === "C" ? chalk.yellow(grade) : chalk.red(grade)} (${totalScore}/105)`));
  console.log(chalk.gray(`  Page loaded in ${loadTime}ms | ${passed}/${total} checks passed\n`));
  console.log(chalk.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  
  for (const [key, cat] of Object.entries(results)) {
    const pct = Math.round((cat.score / cat.max) * 100);
    const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    const color = pct >= 80 ? chalk.green : pct >= 50 ? chalk.yellow : chalk.red;
    console.log(color(`  ${bar} ${cat.label}: ${cat.score}/${cat.max}`));
    
    for (const check of cat.checks) {
      console.log(check.pass ? chalk.green(`    ✓ ${check.desc}`) : chalk.red(`    ✗ ${check.desc}`));
    }
  }
  
  console.log(chalk.bold("\n💡 Top Recommendations:"));
  const allChecks = Object.values(results).flatMap(c => c.checks);
  const failed = allChecks.filter(c => !c.pass);
  if (failed.length === 0) {
    console.log(chalk.green("  🎉 All checks passed! Your landing page is well-optimized."));
  } else {
    const priorities = failed.slice(0, 5);
    for (const f of priorities) {
      console.log(chalk.yellow(`  ⚡ ${f.desc} — ${getFixSuggestion(f.id)}`));
    }
  }
  
  await browser.close();
  
  const report = {
    url,
    grade,
    score: totalScore,
    maxScore: 105,
    loadTimeMs: loadTime,
    passed,
    total,
    screenshot: screenshotPath,
    categories: results,
    recommendations: failed.map(f => ({ check: f.desc, fix: getFixSuggestion(f.id) }))
  };
  
  return report;
}

async function compare(url1, url2, options = {}) {
  console.log(chalk.cyan(`\n📸 PageSnap Compare Mode\n`));
  
  console.log(chalk.bold(`🔹 Page A: ${url1}`));
  const result1 = await audit(url1, { ...options, output: null });
  
  console.log(chalk.bold(`\n🔹 Page B: ${url2}`));
  const result2 = await audit(url2, { ...options, output: null });
  
  console.log(chalk.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.bold("📊 Comparison Summary:"));
  console.log(`  Page A: ${result1.grade} (${result1.score}/105) — ${result1.loadTimeMs}ms`);
  console.log(`  Page B: ${result2.grade} (${result2.score}/105) — ${result2.loadTimeMs}ms`);
  
  const winner = result1.score > result2.score ? "Page A" : result2.score > result1.score ? "Page B" : "Tie";
  console.log(chalk.green(`\n  🏆 Winner: ${chalk.bold(winner)}`));
  
  if (result1.score !== result2.score) {
    const diff = Math.abs(result1.score - result2.score);
    console.log(chalk.yellow(`  📈 Difference: ${diff} points (${Math.round(diff/105*100)}% better CRO)`));
  }
}

function getFixSuggestion(id) {
  const suggestions = {
    h1_exists: "Add a clear H1 heading describing your value proposition",
    cta_visible: "Place a prominent CTA button above the fold (first screen)",
    hero_image: "Add a hero image or illustration to engage visitors",
    headline_clarity: "Keep your headline concise — under 80 characters",
    testimonials: "Add 2-3 customer testimonials with names/photos",
    user_count: "Display your user count: 'Join 500+ developers'",
    logos: "Show logos of companies using your product",
    pricing_section: "Add a clear pricing section to build trust",
    guarantee: "Add a money-back guarantee or free trial mention",
    faq: "Add a FAQ section to address common objections",
    contact_info: "Add contact or support info to reduce anxiety",
    viewport: "Add <meta name='viewport'> for mobile responsiveness",
    responsive_images: "Add width/height attributes to images",
    tap_targets: "Ensure at least 2-3 clear navigation links",
    image_count: "Reduce image count or lazy-load below-fold images",
    no_mega_scripts: "Reduce excessive third-party scripts",
    title_length: "Optimize title tag to 30-65 characters",
    meta_desc: "Add a compelling meta description (120-160 chars)"
  };
  return suggestions[id] || "Review and optimize this element";
}

module.exports = { audit, compare };