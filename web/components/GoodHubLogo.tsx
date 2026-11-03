import Image from 'next/image';

interface GoodHubLogoProps {
  className?: string;
}

export default function GoodHubLogo({ className = '' }: GoodHubLogoProps) {
  return (
    <span className={`inline-flex h-10 w-[170px] shrink-0 dark:rounded dark:bg-white dark:p-1 ${className}`}>
      <Image
        src="/goodhub-wordmark-balanced.png"
        alt="GOODHUB"
        width={1340}
        height={313}
        loading="eager"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
