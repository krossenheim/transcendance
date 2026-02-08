import { useNavigate } from "react-router-dom";

export enum WebPage {
	Home = "/",
	Chat = "/chat",
	Pong = "/pong",
	GDPR = "/gdpr",
};

export function useNavigateToWebPage() {
	const navigate = useNavigate();

	function navigateToWebPage(page: WebPage) {
		navigate(page);
	}

	return navigateToWebPage;
}
