// 서버리스 함수: 순위표 조회/등록 (Vercel + KV/Upstash Redis)
// GET  /api/scores?level=beginner       -> 해당 난이도 순위 목록
// POST /api/scores { level, name, time } -> 점수 등록 후 갱신된 목록
import { kv } from "@vercel/kv";

const VALID_LEVELS = ["beginner", "intermediate", "expert", "hell"];
const MAX_ENTRIES = 20;

export default async function handler(req, res) {
    try {
        if (req.method === "GET") {
            const level = req.query.level;
            if (!VALID_LEVELS.includes(level)) {
                return res.status(400).json({ error: "유효하지 않은 난이도입니다." });
            }
            const scores = (await kv.get(`leaderboard:${level}`)) || [];
            return res.status(200).json({ scores });
        }

        if (req.method === "POST") {
            const { level, name, time } = req.body || {};

            if (!VALID_LEVELS.includes(level)) {
                return res.status(400).json({ error: "유효하지 않은 난이도입니다." });
            }
            if (typeof time !== "number" || !Number.isFinite(time) || time <= 0) {
                return res.status(400).json({ error: "유효하지 않은 기록입니다." });
            }

            // 이름 정제: 최대 12자, 꺾쇠 제거(XSS 방지)
            const safeName = String(name || "AGENT")
                .replace(/[<>]/g, "")
                .trim()
                .slice(0, 12) || "AGENT";

            const key = `leaderboard:${level}`;
            const scores = (await kv.get(key)) || [];

            scores.push({
                name: safeName,
                time: Math.round(time),
                date: new Date().toISOString(),
            });

            // 시간 오름차순(빠를수록 상위) 정렬 후 상위 N개만 보관
            scores.sort((a, b) => a.time - b.time);
            const top = scores.slice(0, MAX_ENTRIES);

            await kv.set(key, top);
            return res.status(200).json({ scores: top });
        }

        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "허용되지 않은 메서드입니다." });
    } catch (err) {
        return res.status(500).json({ error: "서버 오류가 발생했습니다." });
    }
}
