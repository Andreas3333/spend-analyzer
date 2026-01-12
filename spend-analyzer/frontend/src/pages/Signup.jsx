import { useState } from 'react';
import { signUp, confirmSignUp } from 'aws-amplify/auth';
import {
    Flex,
    Box,
    FormControl,
    FormLabel,
    Input,
    Stack,
    Button,
    Heading,
    Text,
    useColorModeValue,
    Link,
    Container,
    InputGroup,
    InputRightElement
} from '@chakra-ui/react';
import { Link as RouterLink, useNavigate } from 'react-router-dom'; 
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';

export default function Signup() {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const navigate = useNavigate();

    const handleSignup = async (e) => {
        e.preventDefault();
        try {
            const { isSignUpComplete, userId } = await signUp({
                username: email, 
                password,
                options: {
                    userAttributes: {
                        email,
                    },
                    autoSignIn: true 
                }
            });

            console.log('Sign up initiated', userId);

            const code = prompt('Enter confirmation code sent to your email');
            if (!code) return alert('Confirmation code required');

            await confirmSignUp({ 
                username: email, 
                confirmationCode: code 
            });

            navigate('/login'); 
            
        } catch (err) {
            console.error('Signup error', err);
            alert(err.message || 'Signup failed');
        }
    };

    return (
        <Flex
            minH={'100vh'}
            align={'center'}
            justify={'center'}
            bg={useColorModeValue('gray.50', 'gray.800')}>
            <Container maxW={'lg'}>
                <Stack spacing={8} mx={'auto'} py={12} px={6}>
                    <Stack align={'center'}>
                        <Heading fontSize={'4xl'} textAlign={'center'}>Create Account</Heading>
                        <Text fontSize={'lg'} color={'gray.600'}>
                            Start analyzing your spending using the Spend Analyzer App
                        </Text>
                    </Stack>
                    <Box
                        rounded={'lg'}
                        bg={useColorModeValue('white', 'gray.700')}
                        boxShadow={'lg'}
                        p={8}>
                        <Stack spacing={4} as="form" onSubmit={handleSignup}>
                            <FormControl id="email" isRequired>
                                <FormLabel>Email address</FormLabel>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </FormControl>
                            <FormControl id="password" isRequired>
                                <FormLabel>Password</FormLabel>
                                <InputGroup>
                                    <Input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <InputRightElement h={'full'}>
                                        <Button
                                            variant={'ghost'}
                                            onClick={() => setShowPassword((show) => !show)}>
                                            {showPassword ? <ViewIcon /> : <ViewOffIcon />}
                                        </Button>
                                    </InputRightElement>
                                </InputGroup>
                            </FormControl>
                            <Stack spacing={10} pt={2}>
                                <Button
                                    type="submit"
                                    size="lg"
                                    bg={'blue.400'}
                                    color={'white'}
                                    _hover={{
                                        bg: 'blue.500',
                                    }}>
                                    Sign up
                                </Button>
                            </Stack>
                            <Stack pt={6}>
                                <Text align={'center'}>
                                    Already a user? <Link as={RouterLink} to="/login" color={'blue.400'}>Login</Link>
                                </Text>
                            </Stack>
                        </Stack>
                    </Box>
                </Stack>
            </Container>
        </Flex>
    );
}
