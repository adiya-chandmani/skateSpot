import type { Metadata } from "next";
import Screen from "@/components/Screen";

export const metadata: Metadata = { title: "이용약관 — SK8KR" };

// ponytail: draft text. Legal review required before public launch (PRD §15).
export default function Terms() {
  return (
    <Screen title="이용약관 (초안)" backLabel="뒤로">
      <article className="card flex flex-col gap-3 text-subhead leading-relaxed">
      <p>SK8KR은 스케이터가 스팟 정보를 공유하는 커뮤니티 지도입니다.</p>
      <h2 className="pt-2 text-headline font-semibold">가입</h2>
      <p>만 14세 이상만 가입할 수 있습니다. 지도·검색·상세 보기는 가입 없이 이용할 수 있습니다.</p>
      <h2 className="pt-2 text-headline font-semibold">등록 콘텐츠</h2>
      <ul className="list-disc pl-5">
        <li>공개적으로 접근 가능한 스케이트 장소만 등록합니다.</li>
        <li>주거지의 사적 주소, 출입 제한 구역, 타인의 개인정보를 노출하는 사진을 등록하지 않습니다.</li>
        <li>직접 촬영했거나 공유 권한이 있는 사진만 사용합니다.</li>
        <li>공개 지도 등록은 토지 소유자의 이용 허가를 뜻하지 않습니다.</li>
      </ul>
      <h2 className="pt-2 text-headline font-semibold">정보의 한계</h2>
      <p>
        ‘공개됨’은 운영상 노출 상태이며 안전, 스케이트 허용, 현장 검증을 의미하지 않습니다.
        현장의 안전과 규칙은 이용자가 직접 확인해야 합니다.
      </p>
      <h2 className="pt-2 text-headline font-semibold">운영</h2>
      <p>운영자는 신고와 검토에 따라 콘텐츠를 숨기거나 삭제할 수 있습니다. 하루 등록·신고 수에 제한이 있습니다.</p>
    </article>
    </Screen>
  );
}
