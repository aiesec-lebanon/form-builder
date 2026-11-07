import * as React from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

/** Turns plain-text URLs into links (as React elements; never innerHTML). */
export function linkify(text: string): React.ReactNode[] {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow" className="ae-link break-all">
        {part}
      </a>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );
}
