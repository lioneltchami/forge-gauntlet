import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Gauntlet — quality loops that beat a real bar",
	description:
		"Named fetchable bar. Blind critic. Binary win. Not a multi-model chat aggregator. Technique by Matt Shumer.",
	metadataBase: new URL("https://gauntlet-runtime.vercel.app"), // production alias
	openGraph: {
		title: "Gauntlet",
		description:
			"Quality loops that won’t stop until they beat a real bar. Not multi-model chat.",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Gauntlet",
		description: "Quality loops that beat a real bar.",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
