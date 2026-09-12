import { test, expect } from "@playwright/test";

const STORAGE_KEY = "zfl-14-repairs";

async function resetStorage(page) {
  await page.goto("/");
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
}

test.describe("维修记录", () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test("新增记录后显示处理内容、处理结果和处理时间，列表显示最近处理时间", async ({ page }) => {
    const card = page.locator(".repair").first();

    await card.locator(".record-form textarea[name='content']").fill("拆开软管接口，发现密封圈老化");
    await card.locator(".record-form input[name='result']").fill("更换密封圈，已不再渗水");
    await card.locator(".record-form button[type='submit']").click();

    const entry = card.locator(".record-entry");
    await expect(entry).toHaveCount(1);
    await expect(card.locator(".record-content")).toHaveText("拆开软管接口，发现密封圈老化");
    await expect(card.locator(".record-result")).toHaveText("处理结果：更换密封圈，已不再渗水");
    await expect(card.locator(".record-time")).toHaveText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);

    await expect(card.locator(".last-time")).toHaveText(/^最近处理：\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    await expect(card.locator(".record-empty")).toHaveCount(0);
  });

  test("多次记录按处理时间倒序显示，最新记录在最前", async ({ page }) => {
    const card = page.locator(".repair").first();
    const form = card.locator(".record-form");

    await form.locator("textarea[name='content']").fill("第一次处理：检查问题");
    await form.locator("input[name='result']").fill("暂未解决");
    await form.locator("button[type='submit']").click();
    await expect(card.locator(".record-entry")).toHaveCount(1);

    await card.locator(".record-form textarea[name='content']").fill("第二次处理：更换零件");
    await card.locator(".record-form input[name='result']").fill("问题解决");
    await card.locator(".record-form button[type='submit']").click();

    const entries = card.locator(".record-entry");
    await expect(entries).toHaveCount(2);
    await expect(entries.first().locator(".record-content")).toHaveText("第二次处理：更换零件");
    await expect(entries.nth(1).locator(".record-content")).toHaveText("第一次处理：检查问题");

    const times = await entries.evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.time)));
    expect(times[0]).toBeGreaterThanOrEqual(times[1]);
  });

  test("刷新后记录内容与处理时间保持不变", async ({ page }) => {
    const card = page.locator(".repair").first();

    await card.locator(".record-form textarea[name='content']").fill("拧紧松动的合页螺丝");
    await card.locator(".record-form input[name='result']").fill("门不再异响");
    await card.locator(".record-form button[type='submit']").click();

    const savedTime = await card.locator(".record-entry").getAttribute("data-time");
    const savedTimeText = await card.locator(".record-time").textContent();
    expect(savedTime).toBeTruthy();

    await page.reload();

    const reloaded = page.locator(".repair").first();
    await expect(reloaded.locator(".record-entry")).toHaveCount(1);
    await expect(reloaded.locator(".record-content")).toHaveText("拧紧松动的合页螺丝");
    await expect(reloaded.locator(".record-result")).toHaveText("处理结果：门不再异响");
    await expect(reloaded.locator(".record-entry")).toHaveAttribute("data-time", savedTime);
    await expect(reloaded.locator(".record-time")).toHaveText(savedTimeText.trim());

    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.repairs[0].records).toHaveLength(1);
    expect(stored.repairs[0].records[0].time).toBe(Number(savedTime));
    expect(stored.repairs[0].records[0].content).toBe("拧紧松动的合页螺丝");
    expect(stored.repairs[0].records[0].result).toBe("门不再异响");
  });

  test("没有任何记录的事项排在有记录的事项之后", async ({ page }) => {
    const addForm = page.locator("#repair-form");
    await addForm.locator("input[name='location']").fill("阳台");
    await addForm.locator("textarea[name='title']").fill("晾衣架松动");
    await addForm.locator("button[type='submit']").click();

    const cards = page.locator(".repair");
    await expect(cards).toHaveCount(2);
    // 两个事项都还没有记录时，按原有新增顺序展示
    await expect(cards.first().locator("h3")).toHaveText("阳台");

    // 给第二个事项（厨房）添加一次记录后，它应排到最前
    const kitchen = cards.nth(1);
    await kitchen.locator(".record-form textarea[name='content']").fill("已上门查看");
    await kitchen.locator(".record-form input[name='result']").fill("等待配件");
    await kitchen.locator(".record-form button[type='submit']").click();

    await expect(page.locator(".repair").first().locator("h3")).toHaveText("厨房");
    await expect(page.locator(".repair").nth(1).locator("h3")).toHaveText("阳台");
    await expect(page.locator(".repair").nth(1).locator(".no-record")).toHaveText("暂无处理记录");
  });
});

test.describe("既有功能回归", () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test("新增事项、状态切换、删除与本地保存继续可用", async ({ page }) => {
    const addForm = page.locator("#repair-form");
    await addForm.locator("input[name='location']").fill("卫生间");
    await addForm.locator("textarea[name='title']").fill("地漏反味");
    await addForm.locator("select[name='status']").selectOption("doing");
    await addForm.locator("button[type='submit']").click();

    const card = page.locator(".repair").first();
    await expect(card.locator("h3")).toHaveText("卫生间");
    await expect(card.locator(".status.doing")).toHaveText("处理中");
    await expect(card.locator(".record-form")).toBeVisible();

    // 切换状态并刷新，状态保持
    await card.locator("select[data-status]").selectOption("done");
    await expect(card.locator(".status.done")).toHaveText("已完成");
    await page.reload();
    await expect(page.locator(".repair").first().locator(".status.done")).toHaveText("已完成");

    // 刷新后新增事项仍在
    await expect(page.locator(".repair h3")).toHaveText(["卫生间", "厨房"]);

    // 删除事项
    await page.locator(".repair").first().locator("button[data-delete]").click();
    await expect(page.locator(".repair h3")).toHaveText(["厨房"]);
  });
});
