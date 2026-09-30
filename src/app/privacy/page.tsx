import type { Metadata } from "next";
import Screen from "@/components/Screen";

export const metadata: Metadata = { title: "개인정보처리방침 — SKATESPOT" };

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

// ponytail: draft text mirroring PRD §9/§13. Legal review required before public launch (PRD §15).
export default function Privacy() {
  return (
    <Screen title="개인정보처리방침 (초안)" backLabel="뒤로">
      <article className="card flex flex-col gap-3 text-subhead leading-relaxed">

      <h2 className="pt-2 text-headline font-semibold">운영 문의·삭제 요청</h2>
      <p>
        로그인하지 못하는 분도 개인정보·사진 삭제를 요청할 수 있습니다:{" "}
        {CONTACT ? (
          <a className="font-semibold text-link underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
        ) : (
          <strong>(출시 전 운영 문의 주소 설정 필요)</strong>
        )}
      </p>

      <h2 className="pt-2 text-headline font-semibold">수집 항목</h2>
      <ul className="list-disc pl-5">
        <li>계정: 이메일 주소(로그인용). 공개 화면에 표시하지 않습니다.</li>
        <li>등록 콘텐츠: 사진(메타데이터 제거 후), 사용자가 확정한 스팟 좌표, 이름·설명·유형.</li>
        <li>즐겨찾기: 계정과 저장한 스팟. 본인에게만 표시되며 해제 또는 회원 탈퇴 시 삭제합니다.</li>
        <li>신고: 사유와 설명. 신고자 정보는 공개하지 않습니다.</li>
      </ul>

      <h2 className="pt-2 text-headline font-semibold">위치 정보</h2>
      <p>
        기기의 현재 위치는 ‘My Location’이나 ‘현재 위치 사용’을 누를 때만 브라우저에서 조회하며 서버로 전송하거나 저장하지 않습니다. 사진의 원본 EXIF
        위치는 브라우저에서만 읽고 저장하지 않습니다. 저장되는 좌표는 사용자가 직접 확정한 공개 스팟 좌표뿐입니다. 지역 검색에서 고른 장소의 최근 기록은 이 기기의 브라우저에만 저장되며 서버로 전송하지 않고, 검색 화면에서 언제든 지울 수 있습니다.
      </p>

      <h2 className="pt-2 text-headline font-semibold">사진</h2>
      <p>
        원본 사진과 메타데이터는 서버에 저장하지 않습니다. 사진의 픽셀에 담긴 얼굴·차량번호 등은 자동으로 가려지지 않으므로 등록 전에 확인해 주세요.
        문제가 있는 사진은 신고하거나 위 주소로 삭제를 요청할 수 있습니다.
      </p>

      <h2 className="pt-2 text-headline font-semibold">보존과 삭제</h2>
      <ul className="list-disc pl-5">
        <li>스팟 삭제·회원 탈퇴 시 즉시 비공개되며 24시간 이내 파일과 기록을 삭제합니다.</li>
        <li>탈퇴 시 제출한 신고는 계정 연결과 설명을 제거한 운영 기록으로만 남습니다.</li>
        <li>베타 분석 원자료는 90일 후 삭제하고 비식별 집계만 유지합니다.</li>
        <li>백업 보존 기간: 출시 전 확정 후 기재합니다.</li>
      </ul>
    </article>
    </Screen>
  );
}
