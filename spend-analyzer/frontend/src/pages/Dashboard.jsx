import { Box, Heading, Text, Button, Container, VStack, HStack, Spinner } from '@chakra-ui/react';
import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser, fetchAuthSession, signOut } from 'aws-amplify/auth';
import { useNavigate } from 'react-router-dom';
import UploadTransactions from '../components/UploadTransactions';
import { list } from 'aws-amplify/storage';


export default function Dashboard({ onLogout }) {
    const [userEmail, setUserEmail] = useState(null);
    const [datasets, setDatasets] = useState([]);
    const [pending, setPending] = useState([]);
    const navigate = useNavigate();

    // Helper to sync pending state from storage
    const loadPendingFromStorage = useCallback(() => {
        const raw = localStorage.getItem('pendingDatasets');
        const curPending = raw ? JSON.parse(raw) : [];
        setPending(curPending);
    }, []);

    const loadDatasets = useCallback(async () => {
        try {
            const u = await getCurrentUser();
            const username = u.username;

            const result = await list({
                path: `${username}/`,
                options: { listAll: true }
            });

            const items = result?.items ?? [];
            const keys = items
                .map(item => item.path || item.key)
                .map(path => path.replace(`${username}/`, ''))
                .filter(name => name.length > 0);

            setDatasets(keys);

            const raw = localStorage.getItem('pendingDatasets');
            const curPending = raw ? JSON.parse(raw) : [];

            // IMPROVED FILTER: 
            // Checks if the pending name OR the base name exists in S3
            const remaining = curPending.filter(p => {
                const isStillPending = !keys.includes(p);
                return isStillPending;
            });

            // Only update if the list actually changed to avoid infinite re-renders
            if (remaining.length !== curPending.length) {
                localStorage.setItem('pendingDatasets', JSON.stringify(remaining));
                setPending(remaining);
            }
        } catch (err) {
            console.error('Error fetching datasets:', err);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        // Fetch user info
        getCurrentUser().then(u => {
            if (mounted) setUserEmail(u.attributes?.email || u.username);
        }).catch(() => {
            if (mounted) setUserEmail(null);
        });

        // Initial load
        loadPendingFromStorage();
        loadDatasets();

        // Polling for background processing
        const polling = setInterval(() => {
            const raw = localStorage.getItem('pendingDatasets');
            const curPending = raw ? JSON.parse(raw) : [];
            if (curPending.length > 0) loadDatasets();
        }, 5000);

        // Event listener for immediate updates from UploadTransactions
        const handler = () => {
            if (mounted) {
                // Force the pending state to refresh from localStorage immediately
                const raw = localStorage.getItem('pendingDatasets');
                setPending(raw ? JSON.parse(raw) : []);

                // Then check S3
                loadDatasets();
            }
        };

        window.addEventListener('pendingDatasetsChanged', handler);

        return () => {
            mounted = false;
            clearInterval(polling);
            window.removeEventListener('pendingDatasetsChanged', handler);
        };
    }, [loadDatasets, loadPendingFromStorage]); // Dependencies for the effect

    return (

        <Container maxW="container.xl" py={10}>
            {/* <Stack direction="row" h="20"> */}
            <VStack spacing={8} align="stretch">
                <Box p={8} borderWidth={1} borderRadius="lg" boxShadow="lg" bg="white">
                    <Heading mb={4}>Spend Analyzer Dashboard</Heading>
                    <Text fontSize="xl">Welcome to your spend analysis overview.</Text>
                    <Box p={8} borderWidth={1} borderRadius="lg" boxShadow="md" bg="white">
                        <Heading size="md" mb={4}>Your Datasets</Heading>

                        <VStack align="stretch" spacing={3}>
                            {datasets.length === 0 && pending.length === 0 && (
                                <Text color="gray.500" italic>No datasets found. Upload a CSV to get started.</Text>
                            )}

                            {/* Ready Datasets */}
                            {datasets.map(ds => (
                                <HStack
                                    key={ds}
                                    p={3}
                                    borderWidth="1px"
                                    borderRadius="md"
                                    _hover={{ bg: "gray.50", cursor: "pointer" }}
                                    onClick={() => navigate(`/analysis/${ds}`)} // Hypothetical route
                                >
                                    <Text fontWeight="bold" flex="1">{ds}</Text>
                                    <Button size="sm" variant="outline" colorScheme="blue">View Analysis</Button>
                                </HStack>
                            ))}

                            {/* Pending Datasets (Still uploading/processing) */}
                            {pending.map(ds => (
                                <HStack key={ds} p={3} borderWidth="1px" borderRadius="md" bg="orange.50" borderColor="orange.200">
                                    <Text color="orange.700" flex="1">{ds}</Text>
                                    <Spinner size="xs" color="orange.500" />
                                </HStack>
                            ))}
                        </VStack>
                    </Box>
                </Box>
                <Box>
                    <UploadTransactions onUploadComplete={loadDatasets} />
                </Box>
                <Box p={8} borderWidth={1} borderRadius="lg" boxShadow="lg" bg="white">
                    {userEmail && (
                        <Text mt={4} color="gray.700">Signed in as {userEmail}</Text>
                    )}

                    {/* Delete Account TODO */}
                    <Button mt={6} colorScheme="red" ml={4} onClick={async () => {
                        const email = prompt('Enter email to delete');
                        if (!email) return;
                        try {
                            const session = await fetchAuthSession();
                            const idToken = session.tokens?.idToken?.toString();

                            const res = await fetch('/auth/delete', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${idToken}`
                                },
                                body: JSON.stringify({ email })
                            });

                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || data.message || 'delete failed');
                            alert('User deleted');
                        } catch (err) {
                            console.error(err);
                            alert('Delete error: ' + (err.message || err));
                        }
                    }}>Delete Account</Button>

                    {/* Signout */}
                    <Button mt={6} ml={4} onClick={async () => {
                        try {
                            await signOut();
                            if (onLogout) onLogout();
                            navigate('/login');
                        } catch (err) {
                            console.error('Sign out error', err);
                            alert('Sign out failed');
                        }
                    }}>Sign out</Button>
                </Box>
            </VStack>
        </Container>
    );
}
