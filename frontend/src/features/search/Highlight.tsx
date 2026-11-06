import { Fragment } from "react";

import { highlightParts } from "./snippet";

export function Highlight({ snippet }: { snippet: string }) {
  return (
    <>
      {highlightParts(snippet).map((part, index) => (
        <Fragment key={index}>{part.hit ? <mark>{part.text}</mark> : part.text}</Fragment>
      ))}
    </>
  );
}
