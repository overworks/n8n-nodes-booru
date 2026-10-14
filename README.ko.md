# @overworks/n8n-nodes-booru

[English](README.md) | [한국어](README.ko.md)

Danbooru와 Danbooru JSON API를 구현한 서버를 위한 n8n 커뮤니티 노드입니다.
추가 런타임 의존성 없이 익명 요청과 사용자명·API 키 인증을 지원합니다.

## 지원 작업

| 리소스 | 작업   | 설명                                         |
| ------ | ------ | -------------------------------------------- |
| Post   | Search | Danbooru 태그와 메타태그로 게시물 검색       |
| Post   | Get    | ID로 게시물 한 개 조회                       |
| Tag    | Search | 이름 패턴, 카테고리, 정렬 기준으로 태그 검색 |

각 결과는 별도의 n8n 아이템으로 반환됩니다. 서버에서 제공하는 경우 게시물 결과에
파일 URL이 포함됩니다. 현재 버전은 이미지 파일을 다운로드하지 않습니다.

## 호환성

기본 주소인 `https://danbooru.donmai.us` 또는 호환 인스턴스의 URL을 사용합니다.
`https://example.org/booru`처럼 경로가 포함된 Base URL도 지원합니다.
서버는 Danbooru의 응답 구조와 쿼리 파라미터를 사용하는 `/posts.json`,
`/posts/{id}.json`, `/tags.json` 엔드포인트를 구현해야 합니다.

Gelbooru, Moebooru, e621은 API가 달라 초기 버전에서 지원하지 않습니다.
Base URL만 바꾸어서는 연동할 수 없습니다. 호환 클론에서도 제공 필드, 계정 권한,
호출 제한은 서버마다 다를 수 있습니다.

개발에는 최신 패치가 적용된 Node.js 24 LTS를 사용하세요. 패키지는 Node.js 22.16 이상을
대상으로 하며, `n8n-workflow` 2.16.0을 기준으로 빌드합니다. 배포 전에 사용할 n8n 버전과
클론 서버의 호환성을 확인해야 합니다. 현재 이 패키지는 n8n 검증 커뮤니티 노드가 아닙니다.

## 설치

패키지가 게시된 후, 자체 호스팅 n8n의 **Settings → Community Nodes**에서
`@overworks/n8n-nodes-booru`를 설치할 수 있습니다. 미검증 커뮤니티 노드는
n8n Cloud에 설치할 수 없습니다.

게시 전 로컬에서 개발하려면 [개발](#개발) 항목을 참고하세요.

## 인증 정보

인증 정보는 선택 사항입니다. 익명으로 요청하려면 인증 정보 선택란을 비워 두고,
노드의 **Base URL**에 사용할 인스턴스 주소를 입력합니다.

인증하려면 다음 항목으로 **Booru API** 인증 정보를 만듭니다.

- **Base URL**: API 키를 발급한 서버의 주소입니다.
- **Username**: 계정의 로그인 이름입니다.
- **API Key**: 해당 서버의 계정 설정에서 발급한 API 키입니다.

인증 정보를 선택하면 인증 정보에 저장된 Base URL이 노드의 Base URL보다 우선합니다.
HTTP Basic 인증을 사용하며, API 키를 비밀번호로 전달합니다. 인증 정보는 n8n이 관리하고
노드 출력에는 포함하지 않습니다. 인증 정보 테스트는 `/profile.json`을 호출하므로,
호환 클론도 이 인증 엔드포인트를 제공해야 합니다.
리디렉션은 비활성화되어 있으므로 서버의 최종 API URL을 입력하세요.

**User Agent**에는 서버가 연동 프로그램을 식별할 수 있는 값을 입력합니다.
가능하면 `n8n-nodes-booru/0.1.0 (user #1234)`처럼 계정 ID를 포함하세요.
노드는 애플리케이션을 식별하는 기본값을 제공하며, 각 서버의 API 이용 지침을 따라야 합니다.

## 사용 방법

[예제 워크플로](examples/search-posts-and-tags.json)를 n8n으로 가져오면
익명으로 게시물과 태그를 검색할 수 있습니다.

**Post → Search**에서는 `landscape rating:g`와 같은 검색어를 입력합니다.
제외 조건과 메타태그를 포함한 검색 구문을 그대로 전달합니다. 검색에 사용할 수 있는
태그 수는 계정과 서버에 따라 제한되며, API 키를 입력한다고 제한이 자동으로 해제되지는 않습니다.

**Tag → Search**에서는 **Name Matches**에 `landscape*`를 입력하고,
필요에 따라 카테고리와 정렬 기준을 선택합니다. General 카테고리의 값은 `0`이며,
필터를 지정하지 않은 상태와 구분됩니다.

### 페이지 이동과 호출 제한

- **Limit**은 한 페이지의 크기가 아니라 전체 페이지에서 반환할 최대 결과 수입니다.
- **Return All**은 빈 페이지를 받을 때까지 조회합니다. 서버의 제한과 입력 아이템당
  최대 1000페이지 제한이 적용됩니다.
- **Page**는 `1`부터 시작합니다. 게시물은 `b12345`처럼 특정 ID 이전의 결과를 조회하는
  커서도 지원합니다. 이 예에서는 ID 12345보다 작은 게시물을 조회합니다. 커서 검색에는
  기본 ID 내림차순 정렬 또는 `order:id_desc`가 필요합니다. 태그는 숫자 페이지를 사용합니다.
- 서버가 작은 페이지를 반환해도 검색을 조기에 종료하지 않습니다. 중복 결과는 제거하며,
  같은 페이지가 반복되거나 커서가 진행되지 않으면 오류를 반환합니다.
- `order:random` 검색은 한 페이지만 조회합니다. Return All을 끄고 Limit을 200 이하로 설정해야 합니다.
- 기본 요청 간격은 1000ms이며, 한 번의 노드 실행 안에서 입력 아이템과 페이지 전체에 공유됩니다.
  다른 실행이나 다른 노드는 별도의 제한을 사용합니다. 서버·계정·IP의 호출 한도를 공유한다면
  워크플로를 순차적으로 실행하세요.
- HTTP 429 응답은 `Retry-After`와 지수 백오프를 적용해 최대 세 번 재시도합니다.
  서버가 요구하는 대기 시간이 60초를 초과하면 조기에 재시도하지 않고, 나중에 워크플로를
  실행하도록 안내합니다. 다른 HTTP 오류는 즉시 실패 처리합니다. n8n의 일반적인
  **On Error** 설정도 사용할 수 있습니다.
- 서버가 페이지 제한 응답(410)을 반환하면 ID순 게시물 검색을 특정 ID 이전 커서로
  재개하는 방법을 안내합니다. 검색 순서를 자동으로 변경하지 않습니다.

### 출력

기본값인 **Raw**는 각 아이템의 JSON에 원본 API 레코드를 반환합니다.
서버에만 존재하는 필드도 포함됩니다.

게시물에서 선택할 수 있는 **Normalized**는 `postUrl`, `fileUrl`, `previewUrl`,
`sampleUrl`, `tags`, `tagCategories` 등의 공통 필드를 제공합니다. 전체 원본 레코드는
`raw`에 보존합니다. Danbooru 등급 코드(`g`, `s`, `q`, `e`)는 서로 합치지 않고 그대로
유지합니다. 제공되지 않는 파일 URL은 `null`이며, 접근이 제한되거나 삭제된 게시물을
임의로 결과에서 제외하지 않습니다.

## 개발

공식 `@n8n/node-cli`의 선언형 템플릿을 따르며, n8n의 HTTP 및 인증 헬퍼를 사용합니다.
`dependencies`는 비워 두고, `n8n-workflow`는 호스트가 제공하는 피어 의존성으로 사용합니다.

```sh
npm ci --ignore-scripts
npm run check
npm run dev
```

개발 도구에는 이 노드에서 사용하지 않는 선택적 피어 연동이 포함되어 있어,
`.npmrc`에 `legacy-peer-deps=true`를 설정했습니다. `--ignore-scripts`로 설치하면
상위 의존성인 ESLint 플러그인의 특정 패키지 관리자용 preinstall 훅을 건너뜁니다.
프로젝트 검사는 `npm run check`와 패키지 게시 과정에서 명시적으로 실행합니다.

`npm run dev`는 개발용 n8n 인스턴스에 노드를 로드합니다. CLI의 안내에 따라 지원되는
로컬 런타임을 사용하세요. 기존 인스턴스에 연결하려면
[공식 CLI 문서](https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool)를 참고하세요.

그 밖의 명령은 다음과 같습니다.

```sh
npm run lint
npm run build
npm test
npm pack --dry-run
```

테스트는 Node 내장 테스트 실행기와 모의 API 응답을 사용합니다. 계정 인증 정보나
이미지 다운로드 없이 요청 구성, 인증 정보와 서버 선택, 페이지 이동, 호출 간격 제한,
재시도, 응답 검증, 원본을 보존하는 정규화를 확인합니다.

## 기여하기

개발, 테스트, PR 작성 방법은 [기여 가이드](CONTRIBUTING.md)를 참고하세요.
코딩 에이전트는 [AGENTS.md](AGENTS.md)의 저장소 지침도 따라야 합니다.

## 패키지 게시

GitHub Actions 게시 워크플로는 `v0.1.0` 또는 `0.1.0`과 같은 버전 태그를 푸시하면 실행됩니다.
태그는 `package.json`의 버전과 일치해야 합니다. `prepublishOnly`로 검사를 실행한 뒤,
npm provenance를 포함해 공개 패키지로 게시합니다.

저장소 `overworks/n8n-nodes-booru`와 워크플로 `publish.yml`에 대해
npm Trusted Publishing을 설정하세요. 최초 게시이거나 Trusted Publishing을 설정하지
않은 경우, 적절한 권한을 가진 npm 토큰을 저장소의 `NPM_TOKEN` 시크릿에 등록합니다.
패키지를 게시하는 것만으로 n8n 검증이나 Cloud 사용 자격을 얻는 것은 아닙니다.

## 참고 자료

- [n8n 커뮤니티 노드 개발](https://docs.n8n.io/integrations/community-nodes/building-community-nodes)
- [n8n 검증 지침](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)
- [Danbooru API](https://danbooru.donmai.us/wiki_pages/help:api)
- [Danbooru 게시물 API](https://danbooru.donmai.us/wiki_pages/api:posts)
- [Danbooru 태그 API](https://danbooru.donmai.us/wiki_pages/api:tags)

## 라이선스

[MIT](LICENSE).
