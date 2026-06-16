// 서버리스 함수: 일간/주간 순위표 조회/등록 (Vercel + KV/Upstash Redis)
// GET  /api/scores?level=beginner&period=daily   -> 해당 난이도/기간 순위 목록
// POST /api/scores { level, name, time }          -> 일간·주간 모두 등록 후 목록 반환
//
// 자동 초기화 원리:
//  - 기간별로 키가 분리됨 (예: leaderboard:hell:daily:2026-06-16)
//  - 날짜/주가 바뀌면 새 키를 사용하므로 순위표가 자동으로 비워짐
//  - 지난 기간 데이터는 TTL(만료시간)로 자동 삭제됨
import { kv } from "@vercel/kv";

const VALID_LEVELS = ["beginner", "intermediate", "expert", "hell"];
const VALID_PERIODS = ["daily", "weekly"];
const MAX_ENTRIES = 20;
const DAY = 86400; // 초 단위 하루

// 한국 표준시(KST, UTC+9) 기준 현재 시각
function nowKST() {
    return new Date(Date.now() + 9 * 3600 * 1000);
}

// ISO 주차 계산 (월요일 시작)
function isoWeek(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week =
        1 +
        Math.round(
            ((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
        );
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// 기간 키 문자열 (일간: YYYY-MM-DD, 주간: YYYY-Www)
function periodKey(period) {
    const k = nowKST();
    if (period === "weekly") return isoWeek(k);
    const y = k.getUTCFullYear();
    const m = String(k.getUTCMonth() + 1).padStart(2, "0");
    const d = String(k.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// Redis 키 생성
function redisKey(level, period) {
    return `leaderboard:${level}:${period}:${periodKey(period)}`;
}

// 만료 시간(초): 일간 2일, 주간 9일 보관 후 자동 삭제
function ttlFor(period) {
    return period === "weekly" ? DAY * 9 : DAY * 2;
}

// 순위 비교: 승리 기록을 위로(클리어 시간 빠른 순), 실패 기록은 아래로(오래 버틴 순)
function compareScores(a, b) {
    if (!!a.success !== !!b.success) return a.success ? -1 : 1;
    if (a.success) return a.time - b.time; // 승리끼리: 빠를수록 상위
    return b.time - a.time; // 실패끼리: 오래 버틸수록 상위
}

export default async function handler(req, res) {
    try {
        if (req.method === "GET") {
            const { level, period } = req.query;
            if (!VALID_LEVELS.includes(level) || !VALID_PERIODS.includes(period)) {
                return res.status(400).json({ error: "유효하지 않은 요청입니다." });
            }
            const scores = (await kv.get(redisKey(level, period))) || [];
            return res.status(200).json({ scores });
        }

        if (req.method === "POST") {
            const { level, name, time, success } = req.body || {};

            if (!VALID_LEVELS.includes(level)) {
                return res.status(400).json({ error: "유효하지 않은 난이도입니다." });
            }
            if (typeof time !== "number" || !Number.isFinite(time) || time < 0) {
                return res.status(400).json({ error: "유효하지 않은 기록입니다." });
            }

            // 이름 정제: 최대 12자, 꺾쇠 제거(XSS 방지)
            const safeName =
                String(name || "AGENT")
                    .replace(/[<>]/g, "")
                    .trim()
                    .slice(0, 12) || "AGENT";

            const entry = {
                name: safeName,
                time: Math.round(time),
                success: success === true, // 클리어 여부
                date: new Date().toISOString(),
            };

            // 일간·주간 양쪽에 동시에 기록
            let result = [];
            for (const period of VALID_PERIODS) {
                const key = redisKey(level, period);
                const scores = (await kv.get(key)) || [];
                scores.push(entry);
                scores.sort(compareScores); // 승리 우선, 시간 기준 정렬
                const top = scores.slice(0, MAX_ENTRIES);
                await kv.set(key, top, { ex: ttlFor(period) });
                if (period === "daily") result = top;
            }

            return res.status(200).json({ scores: result });
        }

        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "허용되지 않은 메서드입니다." });
    } catch (err) {
        return res.status(500).json({ error: "서버 오류가 발생했습니다." });
    }
}
