<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;

final readonly class ApiExceptionSubscriber implements EventSubscriberInterface
{
    public function __construct(private LoggerInterface $logger)
    {
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::EXCEPTION => ['onKernelException', 10]];
    }

    public function onKernelException(ExceptionEvent $event): void
    {
        if (!str_starts_with($event->getRequest()->getPathInfo(), '/api/')) {
            return;
        }

        $error = $event->getThrowable();
        $status = $error instanceof HttpExceptionInterface ? $error->getStatusCode() : 500;
        if (500 === $status) {
            $this->logger->error('Unhandled API error: '.$error::class.': '.$error->getMessage(), ['exception' => $error]);
        }
        $message = $status >= 500 ? 'The server could not complete the request. Please retry.' : $error->getMessage();
        $response = new JsonResponse(['error' => $message], $status);
        $response->headers->set('Cache-Control', 'no-store');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        if ($error instanceof HttpExceptionInterface) {
            $response->headers->add($error->getHeaders());
        }
        $event->setResponse($response);
    }
}
